import asyncio
import json
import logging
import math
import os
import secrets
from io import BytesIO
from openpyxl import Workbook
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from aiogram import Bot, Dispatcher, F
from aiogram.filters import Command
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    BufferedInputFile,
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    LabeledPrice,
    Message,
    PreCheckoutQuery,
    WebAppInfo,
)
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from auth import verify_cryptopay_sig, verify_init_data
from fb import Firebase
from pay import CryptoPay

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("app")

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
TEST_WEBHOOK_KEY = os.getenv("TEST_WEBHOOK_KEY", "")
MINI_APP_URL = os.getenv("MINI_APP_URL", "")
CRYPTOPAY_TOKEN = os.getenv("CRYPTOPAY_TOKEN", "")
CRYPTOPAY_NETWORK = os.getenv("CRYPTOPAY_NETWORK", "USDT")
ADMIN_CHAT_ID = os.getenv("ADMIN_CHAT_ID", "")
FIREBASE_URL = os.getenv("FIREBASE_URL", "https://money-family-f9d8b-default-rtdb.europe-west1.firebasedatabase.app")

KYIV = ZoneInfo("Europe/Kyiv")

TARIFFS = {
    "1month": {"days": 30, "price_usd": 5, "name": "1 месяц"},
    "3months": {"days": 90, "price_usd": 13, "name": "3 месяца"},
    "6months": {"days": 180, "price_usd": 23, "name": "6 месяцев"},
    "12months": {"days": 365, "price_usd": 38, "name": "12 месяцев"},
    "pro1": {"days": 30, "price_usd": 10, "name": "Pro 1 месяц"},
    "pro12": {"days": 365, "price_usd": 75, "name": "Pro 12 месяцев"},
}
BIG_TARIFFS = {"6months", "12months", "pro1", "pro12"}
STARS_PRICES = {"1month": 500, "3months": 1300, "6months": 2300, "12months": 3900, "pro1": 1000, "pro12": 7500}
FAMILY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

bot = Bot(token=BOT_TOKEN) if BOT_TOKEN else None
dp = Dispatcher(storage=MemoryStorage())
fb = Firebase(FIREBASE_URL)
cp = CryptoPay(CRYPTOPAY_TOKEN)

def now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)

def gen_family_code() -> str:
    return "FAM-" + "".join(secrets.choice(FAMILY_CODE_ALPHABET) for _ in range(6))

async def get_user(uid: str) -> dict:
    return (await fb.get(f"/users/{uid}")) or {}

class ReviewState(StatesGroup):
    waiting_text = State()
    waiting_msg = State()

# ---------- ФОНОВЫЕ ЗАДАЧИ ----------
async def daily_check():
    while True:
        try:
            if bot:
                now_sec = int(datetime.now(timezone.utc).timestamp())
                users = (await fb.get("/users")) or {}
                for uid, u in users.items():
                    if not isinstance(u, dict): continue
                    sub_end = int(u.get("subEnd") or 0)
                    if sub_end > 10**11: sub_end //= 1000
                    if sub_end <= 0: continue
                    days = math.ceil((sub_end - now_sec) / 86400)
                    sent_flag = u.get("reminderSent") or 0
                    msg = None
                    new_flag = None
                    if days == 3 and sent_flag < 3:
                        msg, new_flag = "⏰ Подписка истекает через <b>3 дн.</b>", 3
                    elif days == 2 and sent_flag < 2:
                        msg, new_flag = "⏰ Подписка истекает через <b>2 дн.</b>", 2
                    elif days == 1 and sent_flag < 1:
                        msg, new_flag = "⏰ Подписка истекает <b>завтра</b>.", 1
                    elif days <= 0 and sent_flag != 99:
                        msg, new_flag = "❌ <b>Ваша подписка истекла.</b>", 99
                    if msg:
                        try: await bot.send_message(int(uid), msg, parse_mode="HTML")
                        except: pass
                        patch = {"reminderSent": new_flag}
                        if new_flag == 99: patch["status"] = "expired"
                        await fb.patch(f"/users/{uid}", patch)
        except Exception as e:
            log.warning(f"daily_check error: {e}")
        await asyncio.sleep(6 * 60 * 60)

async def daily_reminder():
    while True:
        try:
            if bot:
                kyiv_now = datetime.now(KYIV)
                if 19 <= kyiv_now.hour <= 21:
                    today = kyiv_now.strftime("%Y-%m-%d")
                    users = (await fb.get("/users")) or {}
                    for uid, u in users.items():
                        if not isinstance(u, dict) or u.get("lastDailyRemind") == today: continue
                        sub_end = int(u.get("subEnd") or 0)
                        if sub_end < 10**11: sub_end *= 1000
                        if sub_end <= now_ms(): continue
                        try:
                            await bot.send_message(int(uid), "📝 <b>Не забудь записать траты за сегодня!</b>", parse_mode="HTML")
                            await fb.patch(f"/users/{uid}", {"lastDailyRemind": today})
                        except: pass
        except Exception as e:
            log.warning(f"daily_reminder error: {e}")
        await asyncio.sleep(3600)

# ---------- ХЕНДЛЕРЫ БОТА ----------
if bot:
    @dp.message(Command("start"))
    async def cmd_start(message: Message):
        args = message.text.split()
        ref_id = None
        if len(args) > 1 and args[1].startswith("ref_"): ref_id = args[1][4:]
        
        uid = str(message.from_user.id)
        ts = now_ms()
        existing = await get_user(uid)
        upd = {"name": message.from_user.first_name or "Гость", "username": message.from_user.username or "", "tgId": uid, "lastSeen": ts}
        
        if not existing.get("firstSeen"):
            upd.update({"firstSeen": ts, "tariff": "trial", "subStart": ts, "subEnd": ts + 30 * 86400000, "status": "active", "reminderSent": 0})
        await fb.patch(f"/users/{uid}", upd)

        if ref_id and ref_id != uid and not existing.get("referredBy"):
            await fb.patch(f"/users/{uid}", {"referredBy": ref_id, "referredAt": ts})
            refs = (await fb.get(f"/users/{ref_id}/referrals")) or {}
            refs[uid] = ts
            await fb.put(f"/users/{ref_id}/referrals", refs)
            # Начисление купона за приглашение
            ref_u = await get_user(ref_id)
            c10 = ref_u.get("couponsEarned") or 0
            await fb.patch(f"/users/{ref_id}", {"couponsEarned": c10 + 1})
            if bot:
                try: await bot.send_message(int(ref_id), "🎁 Ты пригласил друга! Начислен купон 10%.", parse_mode="HTML")
                except: pass

        kb = InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="📊 Открыть бюджет", web_app=WebAppInfo(url=MINI_APP_URL))],
            [InlineKeyboardButton(text="💎 Подписка и оплата", callback_data="show_pay")],
            [InlineKeyboardButton(text="🎁 Пригласить друга", callback_data="ref_link")]
        ])
        await message.answer(
            "👋 Привет! Это <b>Family Budget</b> — семейный учёт доходов и расходов.\n\n"
            "Нажми кнопку, чтобы начать.",
            reply_markup=kb, parse_mode="HTML"
        )

    @dp.message(Command("help"))
    async def cmd_help(message: Message):
        await message.answer("/start — бюджет\n/help — справка\n/pay — подписка\n/status — твоя подписка\n/stats — сколько нас\n/referrals — рефералы\n/review — отзыв\n/support — поддержка")

    @dp.message(Command("stats"))
    async def cmd_stats(message: Message):
        users = (await fb.get("/users")) or {}
        total = len(users)
        trial = sum(1 for u in users.values() if isinstance(u, dict) and (u.get("tariff") or "").startswith("trial"))
        paid = total - trial
        await message.answer(f"📊 Всего: <b>{total}</b>\n🎁 На триале: {trial}\n💎 С подпиской: {paid}", parse_mode="HTML")

    @dp.message(Command("status"))
    async def cmd_status(message: Message):
        u = await get_user(str(message.from_user.id))
        sub_end = int(u.get("subEnd") or 0)
        if sub_end < 10**11: sub_end *= 1000
        days = max(0, math.ceil((sub_end - now_ms()) / 86400000))
        await message.answer(f"📊 Тариф: <b>{u.get('tariff', 'trial')}</b>\nОсталось: <b>{days} дн.</b>", parse_mode="HTML")

    @dp.message(Command("pay"))
    async def cmd_pay(message: Message):
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="💳 Открыть тарифы", web_app=WebAppInfo(url=MINI_APP_URL + "?screen=pay"))]])
        await message.answer("Выбери тариф для оплаты:", reply_markup=kb)

    @dp.message(Command("referrals"))
    async def cmd_referrals(message: Message):
        uid = str(message.from_user.id)
        me = await get_user(uid)
        refs = me.get("referrals") or {}
        link = f"https://t.me/moneyfamilybudget_bot?start=ref_{uid}"
        await message.answer(f"👥 <b>Твои рефералы:</b> {len(refs)}\n\nТвоя ссылка:\n<code>{link}</code>", parse_mode="HTML")

    @dp.callback_query(F.data == "ref_link")
    async def cb_ref_link(cb: CallbackQuery):
        uid = str(cb.from_user.id)
        link = f"https://t.me/moneyfamilybudget_bot?start=ref_{uid}"
        share = f"https://t.me/share/url?url={link}&text=Заходи в Family Budget!"
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="📤 Поделиться", url=share)]])
        await cb.message.edit_text(f"🎁 Приглашай друзей!\nТвоя ссылка:\n<code>{link}</code>", parse_mode="HTML", reply_markup=kb)
        await cb.answer()

    @dp.callback_query(F.data == "show_pay")
    async def cb_show_pay(cb: CallbackQuery):
        kb = InlineKeyboardMarkup(inline_keyboard=[[InlineKeyboardButton(text="💳 Открыть тарифы", web_app=WebAppInfo(url=MINI_APP_URL + "?screen=pay"))]])
        await cb.message.edit_text("Нажми кнопку, чтобы выбрать тариф:", reply_markup=kb)
        await cb.answer()

    @dp.message(Command("review"))
    async def cmd_review(message: Message, state: FSMContext):
        await state.set_state(ReviewState.waiting_text)
        await message.answer("📝 Напиши свой отзыв одним сообщением (минимум 10 символов):")

    @dp.message(ReviewState.waiting_text)
    async def review_text(message: Message, state: FSMContext):
        text = (message.text or "").strip()
        if len(text) < 10:
            await message.answer("Слишком коротко.")
            return
        uid = str(message.from_user.id)
        await fb.push("/reviews", {"uid": uid, "name": message.from_user.first_name, "text": text, "ts": now_ms()})
        u = await get_user(uid)
        await fb.patch(f"/users/{uid}", {"coupons20Earned": (u.get("coupons20Earned", 0) + 1)})
        await state.clear()
        await message.answer("✅ Спасибо! Начислен купон 20%.")
        
        if ADMIN_CHAT_ID:
            try:
                channel_id = os.getenv("REVIEW_CHANNEL_ID")
                target = int(channel_id) if channel_id else int(ADMIN_CHAT_ID)
                await bot.send_message(target, f"📝 <b>Новый отзыв</b>\n\n{text}\n\n— {message.from_user.first_name}", parse_mode="HTML")
            except Exception as e:
                log.warning(f"review send error: {e}")

    @dp.message(Command("support"))
    async def cmd_support(message: Message, state: FSMContext):
        await state.set_state(ReviewState.waiting_msg)
        await message.answer("💬 Напиши свой вопрос одним сообщением:")

    @dp.message(ReviewState.waiting_msg)
    async def support_msg(message: Message, state: FSMContext):
        if ADMIN_CHAT_ID:
            try: await bot.send_message(int(ADMIN_CHAT_ID), f"💬 Вопрос от {message.from_user.id}:\n\n{message.text}")
            except: pass
        await state.clear()
        await message.answer("✅ Отправлено. Мы ответим вам в ближайшее время.")

    @dp.pre_checkout_query()
    async def pre_checkout(query: PreCheckoutQuery):
        await query.answer(ok=True)

# ---------- FASTAPI ----------
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

@asynccontextmanager
async def lifespan(app: FastAPI):
    tasks = []
    if bot:
        await bot.delete_webhook(drop_pending_updates=True)
        tasks.append(asyncio.create_task(dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())))
        tasks.append(asyncio.create_task(daily_check()))
        tasks.append(asyncio.create_task(daily_reminder()))
        log.info("bot started")
    yield
    for t in tasks:
        t.cancel()
        try: await t
        except: pass
    if bot: await bot.session.close()
    await fb.close()

app = FastAPI(lifespan=lifespan)
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

async def current_user(x_init_data: str = Header(default="", alias="X-Init-Data")) -> dict:
    user = verify_init_data(x_init_data, BOT_TOKEN)
    if not user: raise HTTPException(status_code=401)
    return user

async def current_uid(user: dict = Depends(current_user)) -> str:
    return str(user["id"])

@app.post("/api/init")
async def api_init(uid: str = Depends(current_uid)):
    u = await get_user(uid)
    sub_end = int(u.get("subEnd") or 0)
    if sub_end < 10**11: sub_end *= 1000
    refs = (await fb.get(f"/users/{uid}/referrals")) or {}
    return {
        "subscription": {"tariff": u.get("tariff") or "trial", "subEnd": sub_end, "status": "active" if sub_end > now_ms() else "expired"},
        "family": {"id": u.get("familyId")} if u.get("familyId") else None,
        "referral": {
            "count": len(refs),
            "code": "FAM-" + uid[-6:].upper(),
            "link": f"https://t.me/moneyfamilybudget_bot?start=ref_{uid}",
            "coupons10": max(0, int(u.get("couponsEarned") or 0) - int(u.get("couponsUsed10") or 0)),
            "coupons20": max(0, int(u.get("coupons20Earned") or 0) - int(u.get("couponsUsed20") or 0)),
        }
    }

@app.get("/api/family")
async def api_family_get(uid: str = Depends(current_uid)):
    u = await get_user(uid)
    fid = u.get("familyId")
    if not fid: raise HTTPException(400, "no family")
    f = (await fb.get(f"/families/{fid}")) or {}
    f["id"] = fid
    return f

@app.post("/api/family/leave")
async def api_family_leave(uid: str = Depends(current_uid)):
    u = await get_user(uid)
    fid = u.get("familyId")
    if not fid: return {"ok": True, "alreadyLeft": True}
    await fb.delete(f"/users/{uid}/familyId")
    try:
        members = await fb.get(f"/families/{fid}/members") or {}
        if isinstance(members, dict) and uid in members:
            members.pop(uid)
            if members: await fb.put(f"/families/{fid}/members", members)
            else: await fb.delete(f"/families/{fid}")
    except: pass
    return {"ok": True, "leftFrom": fid}

@app.post("/api/export")
async def api_export(request: Request, uid: str = Depends(current_uid)):
    if not bot:
        raise HTTPException(503, "Bot is unavailable")

    body = await request.json()
    transactions = body.get("transactions", [])

    if not isinstance(transactions, list):
        raise HTTPException(400, "Invalid transactions")

    wb = Workbook()
    ws = wb.active
    ws.title = "История операций"

    headers = [
        "№",
        "Дата",
        "Вид операции",
        "Описание операции",
        "Категория",
        "Сумма",
        "Валюта",
        "Влияние на бюджет"
    ]
    ws.append(headers)

    income_total = 0
    expense_total = 0

    for index, tx in enumerate(transactions, 1):
        if not isinstance(tx, dict):
            continue

        tx_type = tx.get("type", "")
        amount = float(tx.get("amount") or 0)
        is_expense = tx_type == "expense"

        if is_expense:
            expense_total += amount
            operation = "Расход"
            impact = -amount
        else:
            income_total += amount
            operation = "Доход"
            impact = amount

        ws.append([
            index,
            tx.get("date", ""),
            operation,
            tx.get("title") or tx.get("note") or "",
            tx.get("category") or "Без категории",
            amount,
            body.get("currency", "UAH"),
            impact
        ])

    summary = wb.create_sheet("Итоги")
    summary.append(["ОТЧЁТ ПО ФИНАНСАМ", "Значение"])
    summary.append(["Всего доходов", income_total])
    summary.append(["Всего расходов", expense_total])
    summary.append(["Разница доходов и расходов", income_total - expense_total])
    summary.append(["Количество операций", len(transactions)])
    summary.append(["Валюта", body.get("currency", "UAH")])

    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    header_fill = PatternFill(
        fill_type="solid", fgColor="242B45"
    )
    header_font = Font(
        bold=True, color="FFFFFF"
    )

    for sheet in (ws, summary):
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions

        for cell in sheet[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(
                horizontal="center", vertical="center"
            )

        for col in sheet.columns:
            letter = get_column_letter(col[0].column)
            max_len = max(
                len(str(cell.value or "")) for cell in col
            )
            sheet.column_dimensions[letter].width = min(
                max(max_len + 3, 14), 36
            )

    for row in ws.iter_rows(min_row=2):
        row[5].number_format = '#,##0.00'
        row[7].number_format = '#,##0.00'

    for row in summary.iter_rows(min_row=2, min_col=2, max_col=2):
        row[0].number_format = '#,##0.00'

    output = BytesIO()
    wb.save(output)
    output.seek(0)

    document = BufferedInputFile(
        output.getvalue(),
        filename="Money_Mini_Finances.xlsx"
    )

    try:
        await bot.send_document(
            chat_id=int(uid),
            document=document,
            caption="📊 Твой подробный финансовый отчёт Money Mini"
        )
    except Exception:
        log.exception("Excel export failed")
        raise HTTPException(
            500,
            "Не удалось отправить файл. Открой бота и нажми /start."
        )

    return {"ok": True}

@app.post("/api/tx")
async def api_tx_create(request: Request, uid: str = Depends(current_uid)):
    u = await get_user(uid)
    fid = u.get("familyId")
    if not fid: raise HTTPException(400, "no family")
    body = await request.json()
    tx = {"uid": uid, "type": body.get("type"), "amount": float(body.get("amount")), "category": body.get("category"), "note": body.get("note"), "envelopeId": body.get("envelopeId"), "ts": now_ms()}
    txid = await fb.push(f"/families/{fid}/transactions", tx)
    return {"ok": True, "id": txid}

@app.post("/api/envelope")
async def api_env_create(request: Request, uid: str = Depends(current_uid)):
    u = await get_user(uid)
    fid = u.get("familyId")
    body = await request.json()
    envid = await fb.push(f"/families/{fid}/envelopes", {"name": body.get("name"), "target": float(body.get("target"))})
    return {"ok": True, "id": envid}

@app.post("/api/bank")
async def api_bank_create(request: Request, uid: str = Depends(current_uid)):
    u = await get_user(uid)
    fid = u.get("familyId")
    body = await request.json()
    bid = await fb.push(f"/families/{fid}/banks", {"name": body.get("name"), "target": float(body.get("target")), "balance": 0})
    return {"ok": True, "id": bid}

@app.post("/api/pay/stars")
async def api_pay_stars(request: Request, uid: str = Depends(current_uid)):
    body = await request.json()
    plan = body.get("plan")
    stars = STARS_PRICES.get(plan)
    link = await bot.create_invoice_link(
        title="Family Budget", description="Оплата", payload=json.dumps({"uid": uid, "plan": plan}),
        currency="XTR", prices=[LabeledPrice(label="Подписка", amount=stars)]
    )
    return {"ok": True, "invoice_url": link}

if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
