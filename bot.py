import asyncio
import json
import logging
import math
import os
import re
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
    "1month": {
        "days": 30,
        "price_usd": 6,
        "name": "Basic — 1 месяц",
    },
    "3months": {
        "days": 90,
        "price_usd": 15,
        "name": "Basic — 3 месяца",
    },
    "6months": {
        "days": 180,
        "price_usd": 27,
        "name": "Basic — 6 месяцев",
    },
    "12months": {
        "days": 365,
        "price_usd": 45,
        "name": "Basic — 12 месяцев",
    },
    "pro1": {
        "days": 30,
        "price_usd": 12,
        "name": "PRO — 1 месяц",
    },
    "pro12": {
        "days": 365,
        "price_usd": 85,
        "name": "PRO — 12 месяцев",
    },
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


def has_pro_access(user: dict) -> bool:
    """PRO-only features are available to active PRO subscribers and active trial users."""
    tariff = str(user.get("tariff") or "trial").lower()
    sub_end = int(user.get("subEnd") or 0)
    if 0 < sub_end < 10**11:
        sub_end *= 1000
    return sub_end > now_ms() and tariff in {"trial", "pro", "pro1", "pro12"}

def coupon_percent(coupon_type) -> int:
    value = str(coupon_type or "").strip()
    return 10 if value == "10" else 20 if value == "20" else 0

def available_coupons(user: dict, coupon_type) -> int:
    percent = coupon_percent(coupon_type)
    if percent == 10:
        return max(0, int(user.get("couponsEarned") or 0) - int(user.get("couponsUsed10") or 0))
    if percent == 20:
        return max(0, int(user.get("coupons20Earned") or 0) - int(user.get("couponsUsed20") or 0))
    return 0

def discounted_amount(amount, percent: int):
    return round(float(amount) * (100 - percent) / 100, 2)

async def consume_coupon(uid: str, coupon_type):
    percent = coupon_percent(coupon_type)
    if percent not in (10, 20):
        return
    user = await get_user(uid) or {}
    if available_coupons(user, str(percent)) <= 0:
        raise ValueError(f"Купон {percent}% уже недоступен")
    field = "couponsUsed10" if percent == 10 else "couponsUsed20"
    used = int(user.get(field) or 0)
    await fb.patch(f"/users/{uid}", {field: used + 1})


async def award_referral_coupon(paid_uid: str, payment_path: str):
    """Award one 10% coupon to the referrer for this confirmed payment."""
    payment = await fb.get(payment_path)
    if not isinstance(payment, dict) or payment.get("status") != "paid":
        return False
    if payment.get("referralRewarded"):
        return False

    buyer = await get_user(str(paid_uid)) or {}
    referrer_id = str(buyer.get("referredBy") or "").strip()
    if not referrer_id or referrer_id == str(paid_uid):
        await fb.patch(payment_path, {"referralRewarded": True, "referralRewardedTo": None})
        return False

    referrer = await get_user(referrer_id)
    if not referrer:
        await fb.patch(payment_path, {"referralRewarded": True, "referralRewardedTo": None})
        return False

    earned = int(referrer.get("couponsEarned") or 0)
    await fb.patch(f"/users/{referrer_id}", {"couponsEarned": earned + 1})
    await fb.patch(payment_path, {
        "referralRewarded": True,
        "referralRewardedTo": referrer_id,
        "referralRewardPercent": 10,
    })

    if bot:
        try:
            await bot.send_message(
                int(referrer_id),
                "🎉 <b>Твой реферал пополнил подписку!</b>\n\n"
                "За подтверждённую оплату начислен новый купон <b>10%</b>.\n"
                "Приглашай друзей и получай купоны за их покупки!",
                parse_mode="HTML",
            )
        except Exception:
            log.exception("Could not notify referrer %s about payment reward", referrer_id)
    return True


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
                        if not has_pro_access(u): continue
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

        # Реферал засчитывается только при первом запуске бота новым пользователем.
        # Уже существующий пользователь не может позже привязаться к другому пригласившему.
        if ref_id and ref_id != uid and not existing.get("firstSeen") and not existing.get("referredBy"):
            ref_u = await get_user(ref_id)
            if ref_u:
                await fb.patch(f"/users/{uid}", {"referredBy": ref_id, "referredAt": ts})
                refs = (await fb.get(f"/users/{ref_id}/referrals")) or {}
                if not isinstance(refs, dict):
                    refs = {}
                # Проверка UID не позволяет повторно добавить одного и того же человека.
                if uid not in refs:
                    refs[uid] = ts
                    await fb.put(f"/users/{ref_id}/referrals", refs)
                    c10 = int(ref_u.get("couponsEarned") or 0)
                    await fb.patch(f"/users/{ref_id}", {"couponsEarned": c10 + 1})
                    if bot:
                        try:
                            await bot.send_message(int(ref_id), "🎁 Ты пригласил нового пользователя! Начислен купон 10%.", parse_mode="HTML")
                        except Exception:
                            pass
 
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
        import html

        uid = str(message.from_user.id)
        me = await get_user(uid)
        refs = me.get("referrals") or {}

        if not isinstance(refs, dict):
            refs = {}

        link = f"https://t.me/moneyfamilybudget_bot?start=ref_{uid}"
        now = now_ms()

        total = len(refs)
        trial_count = 0
        paid_count = 0
        expired_count = 0
        lines = []

        for ref_uid, ref_value in list(refs.items())[:25]:
            ref_uid = str(ref_uid)
            user = await get_user(ref_uid)

            if not user:
                name = f"Пользователь {ref_uid}"
            else:
                name = user.get("name") or user.get("username") or ref_uid

            name = html.escape(str(name))
            username = str(user.get("username") or "").strip()
            tariff = str(user.get("tariff") or "unknown")
            sub_end = int(user.get("subEnd") or 0)

            if 0 < sub_end < 10**11:
                sub_end *= 1000

            if sub_end > now:
                days = max(1, math.ceil((sub_end - now) / 86400000))

                if tariff.lower().startswith("trial"):
                    status = f"🎁 Триал, осталось {days} дн."
                    trial_count += 1
                else:
                    status = f"💎 Подписка активна, {days} дн."
                    paid_count += 1
            else:
                status = "⏳ Подписка истекла"
                expired_count += 1

            tariff_names = {
                "trial": "Пробный период",
                "basic": "Basic",
                "pro": "PRO",
                "1month": "Basic",
                "3months": "Basic",
                "6months": "Basic",
                "12months": "Basic",
                "pro1": "PRO",
                "pro12": "PRO",
            }
            tariff_label = tariff_names.get(tariff.lower(), tariff)

            registered = user.get("firstSeen") or user.get("referredAt") or ref_value
            try:
                registered = int(registered)
                if 0 < registered < 10**11:
                    registered *= 1000
                date_text = datetime.fromtimestamp(
                    registered / 1000, timezone.utc
                ).strftime("%d.%m.%Y") if registered > 0 else "неизвестно"
            except (ValueError, TypeError, OSError, OverflowError):
                date_text = "неизвестно"

            handle = f" (@{html.escape(username)})" if username else ""

            lines.append(
                f"• <b>{name}</b>{handle}\n"
                f"  ID: <code>{html.escape(ref_uid)}</code>\n"
                f"  Тариф: {html.escape(tariff_label)}\n"
                f"  Статус: {status}\n"
                f"  Регистрация: {date_text}"
            )

        coupons10 = max(
            0,
            int(me.get("couponsEarned") or 0)
            - int(me.get("couponsUsed10") or 0)
        )
        coupons20 = max(
            0,
            int(me.get("coupons20Earned") or 0)
            - int(me.get("couponsUsed20") or 0)
        )

        text = (
            "👥 <b>ТВОЯ РЕФЕРАЛЬНАЯ СИСТЕМА</b>\n\n"
            f"Всего приглашено: <b>{total}</b>\n"
            f"🎁 Активный триал: <b>{trial_count}</b>\n"
            f"💎 Активная подписка: <b>{paid_count}</b>\n"
            f"⏳ Истёкшая подписка: <b>{expired_count}</b>\n\n"
            "🎟 <b>Доступные купоны</b>\n"
            f"Купоны 10%: <b>{coupons10}</b>\n"
            f"Купоны 20%: <b>{coupons20}</b>\n\n"
            "🔗 <b>Твоя ссылка:</b>\n"
            f"<code>{html.escape(link)}</code>\n\n"
        )

        if lines:
            text += "📋 <b>Приглашённые пользователи</b>\n\n"
            text += "\n\n".join(lines)
            if total > 25:
                text += f"\n\nПоказаны первые 25 из {total} пользователей."
        else:
            text += (
                "Пока никто не присоединился по твоей ссылке.\n"
                "Отправь её друзьям, чтобы начать приглашать!"
            )

        await message.answer(text, parse_mode="HTML")
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
        await message.answer(
            "📝 Напиши свой отзыв о Money Mini.\n\n"
            "Требования:\n"
            "• Минимум 20 символов\n"
            "• Минимум 4 слова\n"
            "• Опиши свой реальный опыт использования\n\n"
            "🎁 За первый принятый отзыв начисляется купон 20%."
        )

    @dp.message(ReviewState.waiting_text)
    async def review_text(message: Message, state: FSMContext):
        import re
        import html

        text = (message.text or "").strip()

        if len(text) < 20:
            await message.answer(
                "❌ Отзыв слишком короткий.\n"
                "Напиши минимум 20 символов."
            )
            return

        # Извлекаем слова на русском, украинском и английском языках.
        words = re.findall(
            r"[a-zа-яіїєґ]+",
            text.lower()
        )

        if len(words) < 4:
            await message.answer(
                "❌ Отзыв должен содержать минимум 4 слова.\n"
                "Расскажи, что тебе понравилось или что стоит улучшить."
            )
            return

        # Проверяем, что текст не состоит из повторяющихся букв.
        letters = re.sub(r"[^a-zа-яіїєґ]", "", text.lower())

        if len(letters) >= 8 and len(set(letters)) <= 2:
            await message.answer(
                "❌ Похоже, это набор случайных букв.\n"
                "Напиши отзыв обычными словами."
            )
            return

        # Проверяем, что пользователь не повторяет одно слово.
        unique_words = set(words)

        if len(words) >= 4 and len(unique_words) == 1:
            await message.answer(
                "❌ Нельзя отправлять отзыв из одного повторяющегося слова.\n"
                "Опиши свой опыт использования приложения."
            )
            return

        # Отсекаем тексты, в которых одно слово повторяется почти везде.
        if len(words) >= 6 and len(unique_words) <= 2:
            await message.answer(
                "❌ В отзыве слишком много повторений.\n"
                "Напиши несколько предложений своими словами."
            )
            return

        uid = str(message.from_user.id)
        user = await get_user(uid) or {}

        # Проверяем, получал ли пользователь купон за отзыв раньше.
        already_received = bool(user.get("reviewCouponReceived"))

        # Сохраняем отзыв в Firebase.
        await fb.push("/reviews", {
            "uid": uid,
            "name": message.from_user.first_name or "Пользователь",
            "text": text,
            "ts": now_ms(),
        })

        # Начисляем купон только один раз.
        if not already_received:
            current_coupons = int(user.get("coupons20Earned") or 0)

            await fb.patch(f"/users/{uid}", {
                "coupons20Earned": current_coupons + 1,
                "reviewCouponReceived": True,
            })

        # Завершаем состояние только после успешной обработки.
        await state.clear()

        # Отправляем отзыв в группу или администратору.
        sent_to_group = False

        if ADMIN_CHAT_ID:
            try:
                channel_id = os.getenv("REVIEW_CHANNEL_ID")
                target = int(channel_id) if channel_id else int(ADMIN_CHAT_ID)

                safe_text = html.escape(text)
                safe_name = html.escape(
                    message.from_user.first_name or "Пользователь"
                )

                await bot.send_message(
                    target,
                    f"📝 <b>Новый отзыв Money Mini</b>\n\n"
                    f"{safe_text}\n\n"
                    f"— {safe_name}",
                    parse_mode="HTML",
                )
                sent_to_group = True

            except Exception as e:
                log.warning(f"review send error: {e}")

        if not sent_to_group:
            await message.answer(
                "⚠️ Отзыв сохранён, но не удалось отправить его в группу. "
                "Попробуй позже или сообщи администратору."
            )
            return

        if already_received:
            await message.answer(
                "✅ Спасибо за отзыв! Он опубликован.\n"
                "🎟 Купон 20% за отзыв можно получить только один раз."
            )
        else:
            await message.answer(
                "✅ Спасибо за отзыв! Он опубликован в группе.\n"
                "🎁 Тебе начислен купон на скидку 20%."
            )

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

    @dp.message(F.successful_payment)
    async def successful_payment(message: Message):
        payment = message.successful_payment

        try:
            payload = json.loads(payment.invoice_payload)
            uid = str(message.from_user.id)
            plan = str(payload.get("plan") or "")
            coupon_type = str(payload.get("couponType") or "")
            percent = coupon_percent(coupon_type)

            # Проверяем тариф и владельца платежа.
            if str(payload.get("uid")) != uid:
                log.error("Stars payment user mismatch: %s", uid)
                await message.answer(
                    "⚠️ Платёж получен, но возникла ошибка проверки. "
                    "Обратись в поддержку."
                )
                return

            tariff = TARIFFS.get(plan)
            expected_stars = int(round(STARS_PRICES.get(plan, 0) * (100 - percent) / 100))
            if not tariff or plan not in STARS_PRICES or payment.total_amount != expected_stars:
                log.error("Unknown paid plan: %s", plan)
                await message.answer(
                    "⚠️ Платёж получен, но тариф не распознан. "
                    "Обратись в поддержку."
                )
                return

            # Один и тот же платёж нельзя обработать повторно.
            charge_id = payment.telegram_payment_charge_id or ""
            if not charge_id:
                log.error("Missing Telegram charge ID for %s", uid)
                await message.answer(
                    "⚠️ Не удалось проверить платёж. Обратись в поддержку."
                )
                return

            import hashlib
            charge_key = hashlib.sha256(
                charge_id.encode("utf-8")
            ).hexdigest()

            payment_path = f"/payments/stars/{charge_key}"
            existing_payment = await fb.get(payment_path)

            if existing_payment:
                # Повторное событие не продлевает подписку повторно, но позволяет
                # восстановить бонус рефереру, если предыдущая попытка завершилась ошибкой.
                if isinstance(existing_payment, dict) and existing_payment.get("status") == "paid":
                    try:
                        await award_referral_coupon(uid, payment_path)
                    except Exception:
                        log.exception("Could not retry Stars referral reward %s", charge_key)
                await message.answer(
                    "✅ Этот платёж уже обработан. "
                    "Проверь статус подписки командой /status."
                )
                return

            user = await get_user(uid) or {}
            now = now_ms()

            sub_end = int(user.get("subEnd") or 0)
            if 0 < sub_end < 10**11:
                sub_end *= 1000

            new_end = max(sub_end, now) + int(
                tariff["days"]
            ) * 86400000

            # Сначала фиксируем платёж, затем обновляем подписку.
            await fb.put(payment_path, {
                "uid": uid,
                "plan": plan,
                "currency": "XTR",
                "amount": payment.total_amount,
                "telegramChargeId": charge_id,
                "paidAt": now,
                "status": "paid",
            })

            await fb.patch(f"/users/{uid}", {
                "tariff": plan,
                "subStart": now,
                "subEnd": new_end,
                "status": "active",
                "reminderSent": 0,
            })
            if percent:
                await consume_coupon(uid, str(percent))
                await fb.patch(payment_path, {"couponType": str(percent), "discount": percent})

            try:
                await award_referral_coupon(uid, payment_path)
            except Exception:
                log.exception("Could not award referral coupon for Stars payment %s", charge_key)

            await message.answer(
                "🎉 <b>Оплата прошла успешно!</b>\n\n"
                f"Тариф: <b>{tariff['name']}</b>\n"
                f"Срок: <b>{tariff['days']} дней</b>\n"
                + (f"Применена скидка: <b>{percent}%</b>\n" if percent else "")
                + "Подписка активирована.",
                parse_mode="HTML",
            )

        except Exception:
            log.exception("Stars payment processing failed")
            await message.answer(
                "⚠️ Платёж получен, но не удалось завершить "
                "активацию автоматически. Обратись в поддержку."
            )
            
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

    family_id = u.get("familyId")
    family_info = None
    if family_id:
        family = (await fb.get(f"/families/{family_id}")) or {}
        members = family.get("members") or {}
        if family and not family.get("archived") and isinstance(members, dict) and uid in members:
            family_info = {"id": family_id}
        else:
            # Remove stale membership; the app never auto-joins a family.
            await fb.patch(f"/users/{uid}", {"familyId": None, "familyRole": None})
            u["familyId"] = None
            u["familyRole"] = None

    refs = (await fb.get(f"/users/{uid}/referrals")) or {}
    return {
        "subscription": {"tariff": u.get("tariff") or "trial", "subEnd": sub_end, "status": "active" if sub_end > now_ms() else "expired"},
        "features": {"pro": has_pro_access(u)},
        "family": family_info,
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
    if not fid:
        raise HTTPException(404, "no family")

    family = (await fb.get(f"/families/{fid}")) or {}
    if not family or family.get("archived"):
        await fb.patch(f"/users/{uid}", {"familyId": None, "familyRole": None})
        raise HTTPException(404, "no family")

    members = family.get("members") or {}
    if not isinstance(members, dict) or uid not in members:
        await fb.patch(f"/users/{uid}", {"familyId": None, "familyRole": None})
        raise HTTPException(404, "no family")

    family["id"] = fid
    family["currentRole"] = u.get("familyRole") or (
        "owner" if family.get("ownerId") == uid else "member"
    )
    return family


@app.post("/api/family/create")
async def api_family_create(request: Request, uid: str = Depends(current_uid)):
    user = await get_user(uid)
    if user.get("familyId"):
        raise HTTPException(409, "Ты уже состоишь в семье. Сначала выйди из текущей семьи.")

    body = await request.json()
    name = " ".join(str(body.get("name") or "").split())[:48] or "Моя семья"
    ts = now_ms()
    member_name = str(user.get("name") or "Участник")[:64]

    family_id = ""
    for _ in range(12):
        candidate = gen_family_code()
        if not await fb.get(f"/families/{candidate}"):
            family_id = candidate
            break
    if not family_id:
        raise HTTPException(503, "Не удалось создать код семьи. Попробуй ещё раз.")

    family = {
        "id": family_id,
        "name": name,
        "ownerId": uid,
        "createdAt": ts,
        "archived": False,
        "members": {
            uid: {
                "name": member_name,
                "joinedAt": ts,
                "role": "owner",
            }
        },
        "transactions": {},
        "envelopes": {},
        "banks": {},
    }

    await fb.put(f"/families/{family_id}", family)
    await fb.patch(f"/users/{uid}", {
        "familyId": family_id,
        "familyRole": "owner",
    })
    return {"ok": True, "family": family}


@app.post("/api/family/join")
async def api_family_join(request: Request, uid: str = Depends(current_uid)):
    user = await get_user(uid)
    if user.get("familyId"):
        raise HTTPException(409, "Ты уже состоишь в семье. Сначала выйди из текущей семьи.")

    body = await request.json()
    code = re.sub(r"\\s+", "", str(body.get("code") or "")).upper()
    if not re.fullmatch(r"FAM-[A-HJ-NP-Z2-9]{6}", code):
        raise HTTPException(400, "Проверь код: он должен выглядеть как FAM-ABC234.")

    family = (await fb.get(f"/families/{code}")) or {}
    if not family:
        raise HTTPException(404, "Семья с таким кодом не найдена.")
    if family.get("archived"):
        raise HTTPException(410, "Эта семейная группа больше не активна.")

    members = family.get("members") or {}
    if not isinstance(members, dict):
        members = {}
    if uid in members:
        await fb.patch(f"/users/{uid}", {"familyId": code, "familyRole": "member"})
        family["id"] = code
        return {"ok": True, "family": family, "alreadyMember": True}
    if len(members) >= 20:
        raise HTTPException(409, "В семье уже достигнут лимит в 20 участников.")

    ts = now_ms()
    members[uid] = {
        "name": str(user.get("name") or "Участник")[:64],
        "joinedAt": ts,
        "role": "member",
    }
    await fb.patch(f"/families/{code}", {"members": members})
    await fb.patch(f"/users/{uid}", {
        "familyId": code,
        "familyRole": "member",
    })

    family["id"] = code
    family["members"] = members
    return {"ok": True, "family": family}


@app.post("/api/family/leave")
async def api_family_leave(uid: str = Depends(current_uid)):
    user = await get_user(uid)
    family_id = user.get("familyId")
    if not family_id:
        return {"ok": True, "alreadyLeft": True}

    family = (await fb.get(f"/families/{family_id}")) or {}
    new_owner_id = None
    archived = False

    if family:
        members = family.get("members") or {}
        if not isinstance(members, dict):
            members = {}
        members.pop(uid, None)

        old_owner_id = str(family.get("ownerId") or "")
        if old_owner_id == uid or old_owner_id not in members:
            new_owner_id = next(iter(members), None)
        else:
            new_owner_id = old_owner_id

        if new_owner_id and isinstance(members.get(new_owner_id), dict):
            members[new_owner_id]["role"] = "owner"

        archived = not bool(members)
        family_patch = {
            "members": members,
            "ownerId": new_owner_id,
            "archived": archived,
            "archivedAt": now_ms() if archived else None,
        }
        await fb.patch(f"/families/{family_id}", family_patch)

        if new_owner_id:
            await fb.patch(f"/users/{new_owner_id}", {"familyRole": "owner"})

    # Removing a membership must never erase personal budget records.
    await fb.patch(f"/users/{uid}", {"familyId": None, "familyRole": None})
    return {
        "ok": True,
        "leftFrom": family_id,
        "archived": archived,
        "newOwnerId": new_owner_id,
        "familyDataPreserved": True,
    }


@app.post("/api/export")
async def api_export(request: Request, uid: str = Depends(current_uid)):
    if not has_pro_access(await get_user(uid)):
        raise HTTPException(403, "PRO_REQUIRED: export")
    if not bot:
        raise HTTPException(503, "Bot is unavailable")

    body = await request.json()
    transactions = body.get("transactions", [])
    currency = str(body.get("currency") or "UAH")

    if not isinstance(transactions, list):
        raise HTTPException(400, "Invalid transactions")

    from datetime import datetime
    from openpyxl.styles import (
        Font, PatternFill, Alignment, Border, Side
    )
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "История операций"

    # Заголовок отчёта
    ws.merge_cells("A1:H1")
    ws["A1"] = "MONEY MINI — ИСТОРИЯ ФИНАНСОВ"
    ws["A1"].font = Font(
        name="Arial", size=16, bold=True, color="FFFFFF"
    )
    ws["A1"].fill = PatternFill(
        "solid", fgColor="242B45"
    )
    ws["A1"].alignment = Alignment(
        horizontal="center", vertical="center"
    )
    ws.row_dimensions[1].height = 32

    ws.merge_cells("A2:H2")
    ws["A2"] = f"Валюта отчёта: {currency}"
    ws["A2"].font = Font(
        name="Arial", italic=True, color="666666"
    )

    headers = [
        "№", "Дата", "Вид операции", "Описание покупки / дохода",
        "Категория", "Сумма", "Валюта", "Влияние на бюджет"
    ]

    header_row = 4
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=header_row, column=col, value=header)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="344563")
        cell.alignment = Alignment(
            horizontal="center", vertical="center", wrap_text=True
        )

    income_total = 0.0
    expense_total = 0.0
    valid_count = 0

    money_format = '#,##0.00;[Red]-#,##0.00'
    thin_gray = Side(style="thin", color="D9E0EA")

    for tx in transactions:
        if not isinstance(tx, dict):
            continue

        tx_type = str(tx.get("type") or "").lower()
        if tx_type not in ("income", "expense"):
            continue

        try:
            amount = float(tx.get("amount") or 0)
        except (TypeError, ValueError):
            continue

        if amount < 0:
            amount = abs(amount)

        valid_count += 1
        is_expense = tx_type == "expense"

        if is_expense:
            expense_total += amount
            operation = "Расход"
            impact = -amount
        else:
            income_total += amount
            operation = "Доход"
            impact = amount

        description = (
            tx.get("title")
            or tx.get("note")
            or tx.get("description")
            or "Без описания"
        )

        row_num = header_row + valid_count
        values = [
            valid_count,
            tx.get("date") or "",
            operation,
            str(description),
            tx.get("category") or "Без категории",
            amount,
            currency,
            impact,
        ]

        for col, value in enumerate(values, 1):
            cell = ws.cell(row=row_num, column=col, value=value)
            cell.alignment = Alignment(
                vertical="center",
                wrap_text=(col in (4, 5))
            )
            cell.border = Border(bottom=thin_gray)

        ws.cell(row_num, 3).fill = PatternFill(
            "solid",
            fgColor="FCE4D6" if is_expense else "E2F0D9"
        )
        ws.cell(row_num, 6).number_format = money_format
        ws.cell(row_num, 8).number_format = money_format

    last_row = header_row + valid_count
    ws.freeze_panes = "A5"
    ws.auto_filter.ref = f"A4:H{max(last_row, 4)}"

    widths = {
        "A": 7, "B": 16, "C": 17, "D": 34,
        "E": 22, "F": 16, "G": 12, "H": 22
    }
    for col, width in widths.items():
        ws.column_dimensions[col].width = width

    ws.sheet_view.showGridLines = False

    # Лист итогов
    summary = wb.create_sheet("Итоги")
    summary.sheet_view.showGridLines = False
    summary.merge_cells("A1:B1")
    summary["A1"] = "MONEY MINI — ФИНАНСОВЫЙ ИТОГ"
    summary["A1"].font = Font(
        size=16, bold=True, color="FFFFFF"
    )
    summary["A1"].fill = PatternFill(
        "solid", fgColor="242B45"
    )
    summary["A1"].alignment = Alignment(horizontal="center")
    summary.row_dimensions[1].height = 32

    summary.append(["Показатель", "Значение"])

    for cell in summary[2]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="344563")

    results = [
        ("Всего доходов", income_total),
        ("Всего расходов", expense_total),
        ("Баланс (доходы − расходы)", income_total - expense_total),
        ("Количество операций", valid_count),
        ("Валюта", currency),
    ]

    for label, value in results:
        summary.append([label, value])

    for row in range(3, 6):
        summary.cell(row, 2).number_format = money_format

    for row in summary.iter_rows():
        for cell in row:
            cell.alignment = Alignment(
                vertical="center", wrap_text=True
            )
            if cell.row >= 3:
                cell.border = Border(bottom=thin_gray)

    summary.column_dimensions["A"].width = 34
    summary.column_dimensions["B"].width = 24
    summary.freeze_panes = "A3"

    # Итоговые строки с выделением
    for cell in summary[5]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="344563")

    # Сохранение Excel в памяти
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
            caption="📊 Твой финансовый отчёт Money Mini"
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

@app.get("/api/family/envelopes")
async def api_family_envelopes(uid: str = Depends(current_uid)):
    user = await get_user(uid)
    fid = user.get("familyId")
    if not fid:
        raise HTTPException(404, "no family")
    family = (await fb.get(f"/families/{fid}")) or {}
    members = family.get("members") or {}
    if not family or family.get("archived") or not isinstance(members, dict) or uid not in members:
        raise HTTPException(403, "Ты не состоишь в этой семейной группе.")
    records = family.get("envelopes") or {}
    envelopes = []
    for envelope_id, envelope in records.items():
        if isinstance(envelope, dict):
            envelopes.append({"id": str(envelope_id), "name": str(envelope.get("name") or "Конверт")[:64], "target": float(envelope.get("target") or 0)})
    return {"envelopes": envelopes}


@app.post("/api/family/envelopes")
async def api_family_envelope_create(request: Request, uid: str = Depends(current_uid)):
    user = await get_user(uid)
    fid = user.get("familyId")
    if not fid:
        raise HTTPException(404, "no family")
    family = (await fb.get(f"/families/{fid}")) or {}
    members = family.get("members") or {}
    if not family or family.get("archived") or not isinstance(members, dict) or uid not in members:
        raise HTTPException(403, "Ты не состоишь в этой семейной группе.")
    body = await request.json()
    name = " ".join(str(body.get("name") or "").split())[:64]
    try:
        target = float(body.get("target") or 0)
    except (TypeError, ValueError):
        raise HTTPException(400, "Укажи корректный лимит конверта.")
    if not name or not math.isfinite(target) or target <= 0:
        raise HTTPException(400, "Укажи название и лимит больше нуля.")
    envelope_id = await fb.push(f"/families/{fid}/envelopes", {"name": name, "target": target, "createdBy": uid, "ts": now_ms()})
    return {"ok": True, "id": envelope_id}


@app.get("/api/family/transactions")
async def api_family_transactions(uid: str = Depends(current_uid)):
    user=await get_user(uid); fid=user.get("familyId")
    if not fid: raise HTTPException(404,"no family")
    family=(await fb.get(f"/families/{fid}")) or {}; members=family.get("members") or {}
    if not family or family.get("archived") or not isinstance(members,dict) or uid not in members: raise HTTPException(403,"Ты не состоишь в этой семейной группе.")
    records=family.get("transactions") or {}; result=[]
    for rid,tx in records.items():
        if not isinstance(tx,dict) or str(tx.get("uid") or "") not in members: continue
        member=members.get(str(tx.get("uid") or ""),{})
        result.append({"id":str(rid),"type":str(tx.get("type") or "expense"),"amount":float(tx.get("amount") or 0),"title":str(tx.get("title") or tx.get("note") or tx.get("category") or "Операция")[:120],"category":str(tx.get("category") or "Разное")[:64],"icon":str(tx.get("icon") or "📦")[:12],"date":str(tx.get("date") or ""),"ts":int(tx.get("ts") or 0),"currency":str(tx.get("currency") or "UAH")[:8],"envelopeId":str(tx.get("envelopeId") or ""),"memberName":str(member.get("name") or "Участник")[:64]})
    result.sort(key=lambda item:item["ts"],reverse=True)
    return {"transactions":result}


@app.post("/api/family/transactions")
async def api_family_transaction_create(request: Request, uid: str = Depends(current_uid)):
    user=await get_user(uid);fid=user.get("familyId")
    if not fid: raise HTTPException(404,"no family")
    family=(await fb.get(f"/families/{fid}")) or {};members=family.get("members") or {}
    if not family or family.get("archived") or not isinstance(members,dict) or uid not in members: raise HTTPException(403,"Ты не состоишь в этой семейной группе.")
    body=await request.json();kind=str(body.get("type") or "").lower()
    if kind not in ("income","expense"): raise HTTPException(400,"Выбери доход или расход.")
    try: amount=float(body.get("amount") or 0)
    except (TypeError,ValueError): raise HTTPException(400,"Укажи корректную сумму.")
    if not math.isfinite(amount) or amount<=0: raise HTTPException(400,"Сумма должна быть больше нуля.")
    envelope_id = str(body.get("envelopeId") or "")
    if kind != "expense":
        envelope_id = ""
    if envelope_id and envelope_id not in (family.get("envelopes") or {}):
        raise HTTPException(400, "Выбранный семейный конверт не найден.")
    tx={"uid":uid,"type":kind,"amount":amount,"title":str(body.get("title") or body.get("category") or "Операция")[:120],"category":str(body.get("category") or "Разное")[:64],"icon":str(body.get("icon") or "📦")[:12],"date":str(body.get("date") or ""),"currency":str(body.get("currency") or "UAH")[:8],"envelopeId":envelope_id or None,"ts":now_ms()}
    rid=await fb.push(f"/families/{fid}/transactions",tx)
    return {"ok":True,"id":rid}

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
    plan = str(body.get("plan") or "")
    base_stars = STARS_PRICES.get(plan)
    if not bot or base_stars is None:
        raise HTTPException(400, "Неизвестный тариф")
    coupon_type = str(body.get("couponType") or "")
    percent = coupon_percent(coupon_type)
    user = await get_user(uid) or {}
    if percent and available_coupons(user, str(percent)) <= 0:
        raise HTTPException(400, f"Нет доступных купонов {percent}%")
    stars = int(round(base_stars * (100 - percent) / 100))
    payload = {"uid": uid, "plan": plan, "couponType": str(percent) if percent else ""}
    link = await bot.create_invoice_link(
        title="Money Mini", description=("Подписка со скидкой " + str(percent) + "%") if percent else "Оплата подписки",
        payload=json.dumps(payload),
        currency="XTR", prices=[LabeledPrice(label="Подписка", amount=stars)]
    )
    return {"ok": True, "invoice_url": link, "amount": stars, "discount": percent}

@app.post("/api/pay/crypto")
async def api_pay_crypto(
    request: Request,
    uid: str = Depends(current_uid),
):
    if not CRYPTOPAY_TOKEN:
        raise HTTPException(503, "Crypto Pay не настроен")

    body = await request.json()
    plan = str(body.get("plan") or "")
    tariff = TARIFFS.get(plan)

    if not tariff:
        raise HTTPException(400, "Неизвестный тариф")

    coupon_type = str(body.get("couponType") or "")
    percent = coupon_percent(coupon_type)
    user = await get_user(uid) or {}
    if percent and available_coupons(user, str(percent)) <= 0:
        raise HTTPException(400, f"Нет доступных купонов {percent}%")
    amount = discounted_amount(tariff["price_usd"], percent)

    result = await cp.call("createInvoice", {
        "asset": "USDT",
        "amount": str(amount),
        "description": (tariff["name"] + " со скидкой " + str(percent) + "%") if percent else tariff["name"],
        "payload": json.dumps({
            "uid": uid,
            "plan": plan,
            "couponType": str(percent) if percent else "",
        }),
        "allow_comments": False,
        "allow_anonymous": False,
    })

    if not result.get("ok"):
        log.error("Crypto Pay invoice error: %s", result)
        raise HTTPException(502, "Не удалось создать счёт")

    invoice = result.get("result") or {}
    pay_url = invoice.get("bot_invoice_url") or invoice.get("pay_url")

    if not pay_url:
        raise HTTPException(502, "Crypto Pay не вернул ссылку")

    return {
        "ok": True,
        "invoice_url": pay_url,
        "invoice_id": invoice.get("invoice_id"),
    }

@app.post("/api/cryptopay/webhook")
async def cryptopay_webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("crypto-pay-api-signature", "")

    if not verify_cryptopay_sig(
        raw_body, signature, CRYPTOPAY_TOKEN
    ):
        raise HTTPException(401, "Invalid Crypto Pay signature")

    try:
        update = json.loads(raw_body)
        invoice = update.get("payload") or {}

        if update.get("update_type") != "invoice_paid":
            return {"ok": True}

        if invoice.get("status") != "paid":
            return {"ok": True}

        invoice_id = str(invoice.get("invoice_id") or "")
        asset = str(invoice.get("asset") or "")
        plan_data = json.loads(invoice.get("payload") or "{}")
        uid = str(plan_data.get("uid") or "")
        plan = str(plan_data.get("plan") or "")
        tariff = TARIFFS.get(plan)
        coupon_type = str(plan_data.get("couponType") or "")
        percent = coupon_percent(coupon_type)

        if not invoice_id or not uid or not tariff:
            raise HTTPException(400, "Invalid invoice data")

        if asset != "USDT":
            raise HTTPException(400, "Unexpected currency")

        expected_amount = discounted_amount(tariff["price_usd"], percent)
        if abs(float(invoice.get("amount") or 0) - expected_amount) > 0.000001:
            raise HTTPException(400, "Unexpected amount")

    except HTTPException:
        raise
    except Exception:
        log.exception("Invalid Crypto Pay webhook payload")
        raise HTTPException(400, "Invalid payload")

    payment_path = f"/payments/crypto/{invoice_id}"
    existing = await fb.get(payment_path)

    if isinstance(existing, dict) and existing.get("status") == "paid":
        # Не активируем подписку повторно, но повторяем начисление бонуса,
        # если первая попытка начисления завершилась ошибкой.
        try:
            await award_referral_coupon(uid, payment_path)
        except Exception:
            log.exception("Could not retry crypto referral reward for invoice %s", invoice_id)
        return {"ok": True, "already_processed": True}

    now = now_ms()
    user = await get_user(uid) or {}

    if isinstance(existing, dict) and existing.get("newEnd"):
        new_end = int(existing["newEnd"])
    else:
        sub_end = int(user.get("subEnd") or 0)
        if 0 < sub_end < 10**11:
            sub_end *= 1000
        new_end = max(sub_end, now) + int(tariff["days"]) * 86400000

    await fb.put(payment_path, {
        "uid": uid,
        "plan": plan,
        "currency": asset,
        "amount": invoice["amount"],
        "invoiceId": invoice_id,
        "paidAt": now,
        "newEnd": new_end,
        "status": "processing",
    })

    await fb.patch(f"/users/{uid}", {
        "tariff": plan,
        "subStart": now,
        "subEnd": new_end,
        "status": "active",
        "reminderSent": 0,
    })

    await fb.patch(payment_path, {"status": "paid"})

    if percent:
        try:
            await consume_coupon(uid, str(percent))
            await fb.patch(payment_path, {"couponType": str(percent), "discount": percent})
        except Exception:
            log.exception("Could not mark used crypto coupon for invoice %s", invoice_id)

    try:
        await award_referral_coupon(uid, payment_path)
    except Exception:
        log.exception("Could not award referral coupon for crypto invoice %s", invoice_id)

    if bot:
        try:
            await bot.send_message(
                int(uid),
                "🎉 <b>Оплата USDT прошла успешно!</b>\n\n"
                f"Тариф: <b>{tariff['name']}</b>\n"
                f"Срок: <b>{tariff['days']} дней</b>\n"
                + (f"Применена скидка: <b>{percent}%</b>\n" if percent else "")
                + "Подписка активирована.",
                parse_mode="HTML",
            )
        except Exception:
            log.exception("Crypto payment notification failed")

    return {"ok": True}

if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
