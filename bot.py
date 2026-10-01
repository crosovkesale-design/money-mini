import asyncio
import json
import logging
import math
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from aiogram import Bot, Dispatcher
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("app")

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
MINI_APP_URL = os.getenv("MINI_APP_URL", "")
CRYPTOPAY_TOKEN = os.getenv("CRYPTOPAY_TOKEN", "")
CRYPTOPAY_NETWORK = os.getenv("CRYPTOPAY_NETWORK", "USDT")
ADMIN_CHAT_ID = os.getenv("ADMIN_CHAT_ID", "")
ADMIN_IDS = {int(x) for x in os.getenv("ADMIN_IDS", "").split(",") if x.strip().isdigit()}
FIREBASE_URL = os.getenv(
    "FIREBASE_URL",
    "https://money-family-f9d8b-default-rtdb.europe-west1.firebasedatabase.app",
)

KYIV = ZoneInfo("Europe/Kyiv")

TARIFFS = {
    "1month":   {"days": 30,  "price_usd": 5,  "name": "1 месяц"},
    "3months":  {"days": 90,  "price_usd": 13, "name": "3 месяца"},
    "6months":  {"days": 180, "price_usd": 23, "name": "6 месяцев"},
    "12months": {"days": 365, "price_usd": 38, "name": "12 месяцев"},
    "pro1":     {"days": 30,  "price_usd": 10, "name": "Pro 1 месяц"},
    "pro12":    {"days": 365, "price_usd": 75, "name": "Pro 12 месяцев"},
}
BIG_TARIFFS = {"6months", "12months", "pro1", "pro12"}

FAMILY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

bot = Bot(token=BOT_TOKEN) if BOT_TOKEN else None
dp = Dispatcher()
fb = Firebase(FIREBASE_URL)
cp = CryptoPay(CRYPTOPAY_TOKEN)


# ---------- утилиты ----------

def now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def gen_family_code() -> str:
    return "FAM-" + "".join(secrets.choice(FAMILY_CODE_ALPHABET) for _ in range(6))


def calc_max_coupons(plan: str) -> int:
    return 3 if plan in BIG_TARIFFS else 1


def apply_discount(price_usd: float, plan: str, use10: int, use20: int):
    """Скидка: 10% за каждый обычный купон, 20% за каждый реферальный.
    Суммарно не больше 50%. При превышении лимита приоритет 20%-купонам."""
    max_c = calc_max_coupons(plan)
    if use10 + use20 > max_c:
        keep20 = min(use20, max_c)
        keep10 = min(use10, max_c - keep20)
        use10, use20 = keep10, keep20
    pct = min(use10 * 10 + use20 * 20, 50)
    final = round(price_usd * (1 - pct / 100), 2)
    return final, pct, use10, use20


async def get_user(uid: str) -> dict:
    return (await fb.get(f"/users/{uid}")) or {}


# ---------- aiogram ----------

if bot:

    @dp.message(Command("start"))
    async def cmd_start(message: Message):
        args = message.text.split()
        ref_id = None
        if len(args) > 1 and args[1].startswith("ref_"):
            ref_id = args[1][4:]

        uid = str(message.from_user.id)
        ts = now_ms()

        if ref_id and ref_id != uid:
            existing = await get_user(uid)
            if not existing.get("referredBy"):
                await fb.patch(f"/users/{uid}", {"referredBy": ref_id, "referredAt": ts})
                refs = (await fb.get(f"/users/{ref_id}/referrals")) or {}
                refs[uid] = ts
                await fb.put(f"/users/{ref_id}/referrals", refs)
                count = len(refs)
                tiers = [1, 5, 10, 20, 40, 80, 160, 320, 640, 1280]
                earned = sum(1 for t in tiers if count >= t)
                await fb.patch(
                    f"/users/{ref_id}",
                    {"referralCount": count, "couponsEarned": earned},
                )

        existing = await get_user(uid)
        upd = {
            "name": message.from_user.first_name or "Гость",
            "username": message.from_user.username or "",
            "tgId": uid,
            "lastSeen": ts,
        }
        if not existing.get("firstSeen"):
            upd.update({
                "firstSeen": ts,
                "tariff": "trial",
                "subStart": ts,
                "subEnd": ts + 30 * 24 * 60 * 60 * 1000,
                "status": "active",
                "reminderSent": 0,
            })
        await fb.patch(f"/users/{uid}", upd)

        kb = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text="Открыть бюджет",
                web_app=WebAppInfo(url=MINI_APP_URL),
            )
        ]])
        await message.answer(
            "Привет! Это <b>Family Budget</b> — учёт доходов и расходов.\n\n"
            "Нажми кнопку, чтобы открыть приложение.",
            reply_markup=kb,
            parse_mode="HTML",
        )

    @dp.message(Command("help"))
    async def cmd_help(message: Message):
        await message.answer(
            "/start — открыть бюджет\n"
            "/help — справка\n"
            "/status — подписка\n"
            "/referrals — мои рефералы"
        )

    @dp.message(Command("status"))
    async def cmd_status(message: Message):
        uid = str(message.from_user.id)
        u = await get_user(uid)
        sub_end = int(u.get("subEnd") or 0)
        if sub_end > 10**11:
            sub_end //= 1000
        left = max(0, math.ceil((sub_end - now_ms() / 1000) / 86400))
        status = "активна" if sub_end * 1000 > now_ms() else "истекла"
        await message.answer(
            "📊 <b>Подписка</b>\n\n"
            f"Тариф: {u.get('tariff') or 'trial'}\n"
            f"Статус: {status}\n"
            f"Осталось: {left} дней",
            parse_mode="HTML",
        )

    @dp.message(Command("referrals"))
    async def cmd_referrals(message: Message):
        uid = str(message.from_user.id)
        me = await get_user(uid)
        refs = me.get("referrals") or {}
        link = f"https://t.me/moneyfamilybudget_bot?start=ref_{uid}"

        if not refs:
            await message.answer(
                "👥 <b>Рефералы</b>\n\nПока никого не пригласил.\n\n"
                f"Твоя ссылка:\n<code>{link}</code>",
                parse_mode="HTML",
            )
            return

        lines = ["👥 <b>Твои рефералы</b>", ""]
        total_paid = 0
        ts_now = now_ms()
        for i, ref_id in enumerate(refs, 1):
            ru = await get_user(ref_id)
            name = ru.get("name") or f"id {ref_id}"
            uname = f"@{ru['username']}" if ru.get("username") else ""
            paid = ru.get("paidAmount") or 0
            total_paid += paid
            sub_end = int(ru.get("subEnd") or 0)
            if 0 < sub_end < 10**11:
                sub_end *= 1000
            st = "активна" if sub_end > ts_now else "истекла"
            lines.append(
                f"{i}. <b>{name}</b> {uname}\n"
                f"   Тариф: {ru.get('tariff') or 'trial'} · {st}\n"
                f"   Купил на: {paid} ₴"
            )
        lines += [
            "",
            f"Всего рефералов: <b>{me.get('referralCount') or 0}</b>",
            f"Купонов 10%: <b>{me.get('couponsEarned') or 0}</b>",
            f"Купонов 20%: <b>{me.get('coupons20Earned') or 0}</b>",
            f"Рефералы купили на <b>${round(total_paid)}</b>",
        ]
        await message.answer("\n".join(lines), parse_mode="HTML")


# ---------- фоновые проверки ----------

async def daily_check():
    """Фоновая проверка подписок: раз в 6 часов"""
    while True:
        try:
            if not bot:
                await asyncio.sleep(6 * 60 * 60)
                continue

            now_sec = int(datetime.utcnow().timestamp())
            users = fb_get("/users") or {}

            for uid, u in users.items():
                if not isinstance(u, dict):
                    continue

                sub_end = u.get("subEnd") or 0
                try:
                    sub_end = int(sub_end)
                except (ValueError, TypeError):
                    continue

                if sub_end > 10**11:
                    sub_end //= 1000

                if sub_end <= 0:
                    continue

                seconds_left = sub_end - now_sec
                days = math.ceil(seconds_left / 86400)
                sent_flag = u.get("reminderSent") or 0

                msg = None
                new_flag = None

                if days == 3 and sent_flag < 3:
                    msg = "⏰ Подписка истекает через <b>3 дн.</b>\n\nПродлить: ⚙️ Настройки → Оплатить."
                    new_flag = 3
                elif days == 2 and sent_flag < 2:
                    msg = "⏰ Подписка истекает через <b>2 дн.</b>\n\nПродлить: ⚙️ Настройки → Оплатить."
                    new_flag = 2
                elif days == 1 and sent_flag < 1:
                    msg = "⏰ Подписка истекает <b>завтра</b>.\n\nПродлить: ⚙️ Настройки → Оплатить."
                    new_flag = 1
                elif days <= 0 and sent_flag != 99:
                    msg = "❌ <b>Ваша подписка истекла.</b>\n\nПродлить: ⚙️ Настройки → Оплатить."
                    new_flag = 99

                if msg and new_flag is not None:
                    try:
                        await bot.send_message(str(uid), msg, parse_mode="HTML")
                    except Exception as e:
                        log.warning("reminder send " + str(uid) + ": " + str(e))
                    patch = {"reminderSent": new_flag}
                    if new_flag == 99:
                        patch["status"] = "expired"
                    fb_patch("/users/" + str(uid), patch)

        except Exception as e:
            log.warning("daily_check error: " + str(e))

        await asyncio.sleep(6 * 60 * 60)

# ---------- FastAPI ----------

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")


@asynccontextmanager
async def lifespan(app: FastAPI):
    polling_task = None
    reminder_task = None
    if bot:
        await bot.delete_webhook(drop_pending_updates=True)
        polling_task = asyncio.create_task(dp.start_polling(bot))
        reminder_task = asyncio.create_task(daily_check())
        log.info("bot started")
    yield
    for t in (polling_task, reminder_task):
        if t:
            t.cancel()
            try:
                await t
            except asyncio.CancelledError:
                pass
    if bot:
        await bot.session.close()
    await fb.close()


app = FastAPI(lifespan=lifespan)


# ---------- auth dependency ----------

async def current_user(x_init_data: str = Header(default="", alias="X-Init-Data")) -> dict:
    user = verify_init_data(x_init_data, BOT_TOKEN)
    if not user:
        raise HTTPException(status_code=401, detail="invalid init data")
    return user


async def current_uid(user: dict = Depends(current_user)) -> str:
    return str(user["id"])


# ---------- базовые ----------

@app.get("/api/health")
async def health():
    return {"ok": True}


# ---------- /api/init ----------

@app.post("/api/init")
async def api_init(user: dict = Depends(current_user)):
    uid = str(user["id"])
    u = await get_user(uid)

    sub_end = int(u.get("subEnd") or 0)
    if sub_end and sub_end < 10**11:
        sub_end *= 1000
    left_days = max(0, math.ceil((sub_end - now_ms()) / 86400000))

    family = None
    fid = u.get("familyId")
    if fid:
        f = (await fb.get(f"/families/{fid}")) or {}
        family = {
            "id": fid,
            "code": f.get("code"),
            "owner": f.get("owner"),
            "isOwner": f.get("owner") == uid,
            "memberCount": len(f.get("members") or {}),
        }

    return {
        "user": {
            "id": user["id"],
            "name": user.get("first_name") or u.get("name") or "Гость",
            "username": user.get("username") or u.get("username") or "",
        },
        "subscription": {
            "tariff": u.get("tariff") or "trial",
            "status": "active" if sub_end > now_ms() else "expired",
            "subEnd": sub_end,
            "daysLeft": left_days,
        },
        "coupons": {
            "c10": int(u.get("couponsEarned") or 0),
            "c20": int(u.get("coupons20Earned") or 0),
            "used10": int(u.get("couponsUsed10") or 0),
            "used20": int(u.get("couponsUsed20") or 0),
        },
        "family": family,
        "tariffs": {
            k: {"name": v["name"], "days": v["days"], "price": v["price_usd"]}
            for k, v in TARIFFS.items()
        },
    }


# ---------- /api/family ----------

@app.get("/api/family")
async def api_family_get(uid: str = Depends(current_uid)):
    u = await get_user(uid)
    fid = u.get("familyId")
    if not fid:
        raise HTTPException(400, "no family")
    f = (await fb.get(f"/families/{fid}")) or {}
    f["id"] = fid
    return f


@app.post("/api/family/create")
async def api_family_create(uid: str = Depends(current_uid)):
    u = await get_user(uid)
    if u.get("familyId"):
        raise HTTPException(400, "already in family")

    fid = fb.url and secrets.token_urlsafe(12)
    code = gen_family_code()
    ts = now_ms()

    family = {
        "code": code,
        "owner": uid,
        "createdAt": ts,
        "members": {uid: {"name": u.get("name") or "Гость", "joinedAt": ts}},
    }
    await fb.put(f"/families/{fid}", family)
    await fb.put(f"/family_codes/{code}", fid)
    await fb.patch(f"/users/{uid}", {"familyId": fid})
    return {"ok": True, "id": fid, "code": code}


@app.post("/api/family/join")
async def api_family_join(request: Request, uid: str = Depends(current_uid)):
    body = await request.json()
    code = str(body.get("code") or "").strip().upper()
    if not code:
        raise HTTPException(400, "no code")

    fid = await fb.get(f"/family_codes/{code}")
    if not fid:
        raise HTTPException(404, "family not found")

    f = (await fb.get(f"/families/{fid}")) or {}
    u = await get_user(uid)
    ts = now_ms()
    await fb.patch(f"/families/{fid}/members/{uid}", {
        "name": u.get("name") or "Гость",
        "joinedAt": ts,
    })
    await fb.patch(f"/users/{uid}", {"familyId": fid})
    return {"ok": True, "id": fid, "code": f.get("code", code)}


# ---------- /api/tx ----------

@app.post("/api/tx")
async def api_tx_create(request: Request, uid: str = Depends(current_uid)):
    u = await get_user(uid)
    fid = u.get("familyId")
    if not fid:
        raise HTTPException(400, "no family")

    body = await request.json()
    type_ = body.get("type")
    if type_ not in ("income", "expense"):
        raise HTTPException(400, "bad type")
    try:
        amount = float(body.get("amount") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "bad amount")
    if amount <= 0:
        raise HTTPException(400, "amount <= 0")

    tx = {
        "uid": uid,
        "type": type_,
        "amount": amount,
        "category": str(body.get("category") or "разное")[:40],
        "note": str(body.get("note") or "")[:200],
        "envelopeId": str(body.get("envelopeId") or "")[:60],
        "ts": now_ms(),
    }
    txid = await fb.push(f"/families/{fid}/transactions", tx)
    return {"ok": True, "id": txid}


@app.delete("/api/tx/{txid}")
async def api_tx_delete(txid: str, uid: str = Depends(current_uid)):
    u = await get_user(uid)
    fid = u.get("familyId")
    if not fid:
        raise HTTPException(400, "no family")

    tx = await fb.get(f"/families/{fid}/transactions/{txid}")
    if not tx:
        raise HTTPException(404, "tx not found")
    if tx.get("uid") != uid and not (u.get("familyOwner") == uid):
        # упрощённо: удалять может автор или владелец семьи
        f = (await fb.get(f"/families/{fid}")) or {}
        if f.get("owner") != uid:
            raise HTTPException(403, "not allowed")

    await fb.delete(f"/families/{fid}/transactions/{txid}")
    return {"ok": True}


# ---------- /api/envelope ----------

@app.post("/api/envelope")
async def api_env_create(request: Request, uid: str = Depends(current_uid)):
    u = await get_user(uid)
    fid = u.get("familyId")
    if not fid:
        raise HTTPException(400, "no family")

    body = await request.json()
    name = str(body.get("name") or "").strip()[:60]
    if not name:
        raise HTTPException(400, "no name")
    try:
        target = float(body.get("target") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "bad target")

    env = {
        "name": name,
        "target": target,
        "createdBy": uid,
        "createdAt": now_ms(),
    }
    envid = await fb.push(f"/families/{fid}/envelopes", env)
    return {"ok": True, "id": envid}


@app.delete("/api/envelope/{envid}")
async def api_env_delete(envid: str, uid: str = Depends(current_uid)):
    u = await get_user(uid)
    fid = u.get("familyId")
    if not fid:
        raise HTTPException(400, "no family")
    await fb.delete(f"/families/{fid}/envelopes/{envid}")
    return {"ok": True}


# ---------- /api/bank ----------

@app.post("/api/bank")
async def api_bank_create(request: Request, uid: str = Depends(current_uid)):
    u = await get_user(uid)
    fid = u.get("familyId")
    if not fid:
        raise HTTPException(400, "no family")

    body = await request.json()
    name = str(body.get("name") or "").strip()[:60]
    if not name:
        raise HTTPException(400, "no name")
    try:
        target = float(body.get("target") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "bad target")

    bank = {
        "name": name,
        "target": target,
        "balance": 0,
        "createdBy": uid,
        "createdAt": now_ms(),
    }
    bid = await fb.push(f"/families/{fid}/banks", bank)
    return {"ok": True, "id": bid}


@app.post("/api/bank/{bid}/deposit")
async def api_bank_deposit(bid: str, request: Request, uid: str = Depends(current_uid)):
    u = await get_user(uid)
    fid = u.get("familyId")
    if not fid:
        raise HTTPException(400, "no family")

    body = await request.json()
    try:
        amount = float(body.get("amount") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "bad amount")
    if amount <= 0:
        raise HTTPException(400, "amount <= 0")

    bank = await fb.get(f"/families/{fid}/banks/{bid}")
    if not bank:
        raise HTTPException(404, "bank not found")

    new_balance = float(bank.get("balance") or 0) + amount
    await fb.patch(f"/families/{fid}/banks/{bid}", {"balance": new_balance})

    # и записываем расход с той же суммы
    await fb.push(f"/families/{fid}/transactions", {
        "uid": uid,
        "type": "expense",
        "amount": amount,
        "category": "🏦 Накопления",
        "note": f"Пополнение банки «{bank.get('name')}»",
        "envelopeId": "",
        "bankId": bid,
        "ts": now_ms(),
    })
    return {"ok": True, "balance": new_balance}


@app.delete("/api/bank/{bid}")
async def api_bank_delete(bid: str, uid: str = Depends(current_uid)):
    u = await get_user(uid)
    fid = u.get("familyId")
    if not fid:
        raise HTTPException(400, "no family")
    await fb.delete(f"/families/{fid}/banks/{bid}")
    return {"ok": True}


# ---------- /api/pay ----------

@app.post("/api/pay/preview")
async def api_pay_preview(request: Request, uid: str = Depends(current_uid)):
    body = await request.json()
    plan = str(body.get("plan") or "")
    if plan not in TARIFFS:
        raise HTTPException(400, "bad plan")

    u = await get_user(uid)
    free10 = max(0, int(u.get("couponsEarned") or 0) - int(u.get("couponsUsed10") or 0))
    free20 = max(0, int(u.get("coupons20Earned") or 0) - int(u.get("couponsUsed20") or 0))

    use10 = min(int(body.get("use10") or 0), free10)
    use20 = min(int(body.get("use20") or 0), free20)
    final, pct, use10, use20 = apply_discount(TARIFFS[plan]["price_usd"], plan, use10, use20)

    return {
        "plan": plan,
        "name": TARIFFS[plan]["name"],
        "base": TARIFFS[plan]["price_usd"],
        "final": final,
        "discountPct": pct,
        "use10": use10,
        "use20": use20,
        "free10": free10,
        "free20": free20,
        "network": CRYPTOPAY_NETWORK,
    }


@app.post("/api/pay/create")
async def api_pay_create(request: Request, uid: str = Depends(current_uid)):
    body = await request.json()
    plan = str(body.get("plan") or "")
    if plan not in TARIFFS:
        raise HTTPException(400, "bad plan")
    if not CRYPTOPAY_TOKEN:
        raise HTTPException(500, "cryptopay not configured")

    u = await get_user(uid)
    free10 = max(0, int(u.get("couponsEarned") or 0) - int(u.get("couponsUsed10") or 0))
    free20 = max(0, int(u.get("coupons20Earned") or 0) - int(u.get("couponsUsed20") or 0))
    use10 = min(int(body.get("use10") or 0), free10)
    use20 = min(int(body.get("use20") or 0), free20)
    final, pct, use10, use20 = apply_discount(TARIFFS[plan]["price_usd"], plan, use10, use20)

    payload = json.dumps({
        "uid": uid,
        "plan": plan,
        "use10": use10,
        "use20": use20,
        "discount": pct,
        "base": TARIFFS[plan]["price_usd"],
        "final": final,
    })

    resp = await cp.call("createInvoice", {
        "asset": CRYPTOPAY_NETWORK,
        "amount": str(final),
        "description": f"Family Budget — {TARIFFS[plan]['name']}",
        "payload": payload,
        "allow_comments": False,
        "allow_anonymous": False,
    })
    if not resp.get("ok"):
        log.warning(f"cryptopay create: {resp}")
        raise HTTPException(500, str(resp.get("error") or resp))

    inv = resp["result"]
    url = inv.get("bot_invoice_url") or inv.get("mini_app_invoice_url")
    return {
        "ok": True,
        "invoiceUrl": url,
        "invoiceId": inv.get("invoice_id"),
        "final": final,
        "discountPct": pct,
    }


@app.post("/api/pay/webhook")
async def api_pay_webhook(request: Request):
    raw = await request.body()
    sig = request.headers.get("crypto-pay-api-signature", "")
    if not verify_cryptopay_sig(raw, sig, CRYPTOPAY_TOKEN):
        log.warning("webhook: bad signature")
        raise HTTPException(401, "bad signature")

    try:
        body = json.loads(raw.decode("utf-8"))
    except Exception:
        return {"ok": True}

    if body.get("update_type") != "invoice_paid":
        return {"ok": True}

    inv = body.get("payload", {})
    try:
        meta = json.loads(inv.get("payload") or "{}")
    except Exception:
        return {"ok": True}

    uid = str(meta.get("uid") or "")
    plan = meta.get("plan")
    use10 = int(meta.get("use10") or 0)
    use20 = int(meta.get("use20") or 0)
    final = float(meta.get("final") or 0)

    if not uid or plan not in TARIFFS:
        return {"ok": True}

    try:
        days = TARIFFS[plan]["days"]
        u = await get_user(uid)

        cur_end = int(u.get("subEnd") or 0)
        if 0 < cur_end < 10**11:
            cur_end *= 1000
        cur_end = max(cur_end, now_ms())
        new_end = cur_end + days * 86400000

        await fb.patch(f"/users/{uid}", {
            "tariff": plan,
            "subStart": now_ms(),
            "subEnd": new_end,
            "status": "active",
            "paidAmount": (u.get("paidAmount") or 0) + final,
            "couponsUsed10": int(u.get("couponsUsed10") or 0) + use10,
            "couponsUsed20": int(u.get("couponsUsed20") or 0) + use20,
            "reminderSent": 0,
        })

        # реферальное вознаграждение
        ref = u.get("referredBy")
        if ref:
            refs = (await fb.get(f"/users/{ref}/referrals")) or {}
            total = 0
            for rid in refs:
                ru = await get_user(rid)
                total += ru.get("paidAmount") or 0
            milestones = int(total // 150)
            rbu = await get_user(ref)
            if milestones > int(rbu.get("coupons20Earned") or 0):
                await fb.patch(f"/users/{ref}", {"coupons20Earned": milestones})
                if bot:
                    try:
                        await bot.send_message(
                            int(ref),
                            f"🎉 Твои рефералы купили на ${round(total)} — получил купон 20%!",
                            parse_mode="HTML",
                        )
                    except Exception:
                        pass

        if bot:
            try:
                await bot.send_message(
                    int(uid),
                    "✅ <b>Оплата получена!</b>\n\n"
                    f"Тариф: {TARIFFS[plan]['name']}\n"
                    f"Сумма: ${final}\n"
                    f"Активен до: {datetime.fromtimestamp(new_end / 1000, KYIV).strftime('%d.%m.%Y')}\n\n"
                    "Открой приложение — всё готово.",
                    parse_mode="HTML",
                )
            except Exception:
                pass

        if bot and ADMIN_CHAT_ID:
            try:
                await bot.send_message(
                    ADMIN_CHAT_ID,
                    f"💰 <b>Оплата</b>\nID: {uid}\n"
                    f"Тариф: {TARIFFS[plan]['name']}\n"
                    f"Сумма: ${final} (скидка {meta.get('discount', 0)}%)",
                    parse_mode="HTML",
                )
            except Exception:
                pass

        return {"ok": True}
    except Exception as e:
        log.warning(f"webhook: {e}")
        return JSONResponse({"ok": False, "err": str(e)}, status_code=500)


# ---------- статика ----------

if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("bot:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
