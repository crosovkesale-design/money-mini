import os
import json
import asyncio
import logging
from datetime import datetime
from contextlib import asynccontextmanager

import requests
from aiogram import Bot, Dispatcher
from aiogram.types import Message, WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.filters import Command
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("app")

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
MINI_APP_URL = os.getenv("MINI_APP_URL", "http://localhost:8000")
CRYPTOPAY_TOKEN = os.getenv("CRYPTOPAY_TOKEN", "")
CRYPTOPAY_NETWORK = os.getenv("CRYPTOPAY_NETWORK", "USDT")
ADMIN_CHAT_ID = os.getenv("ADMIN_CHAT_ID", "")
TEST_WEBHOOK_KEY = os.getenv("TEST_WEBHOOK_KEY", "")

CRYPTOPAY_API = "https://pay.crypt.bot/api"
FIREBASE = "https://money-family-f9d8b-default-rtdb.europe-west1.firebasedatabase.app"

TARIFFS = {
    "1month":   {"days": 30,  "price_usd": 5,  "name": "1 месяц"},
    "3months":  {"days": 90,  "price_usd": 13, "name": "3 месяца"},
    "6months":  {"days": 180, "price_usd": 23, "name": "6 месяцев"},
    "12months": {"days": 365, "price_usd": 38, "name": "12 месяцев"},
    "pro1":     {"days": 30,  "price_usd": 10, "name": "Pro 1 месяц"},
    "pro12":    {"days": 365, "price_usd": 75, "name": "Pro 12 месяцев"},
}

BIG_TARIFFS = ["6months", "12months", "pro1", "pro12"]

if not BOT_TOKEN:
    log.warning("BOT_TOKEN missing")

bot = Bot(token=BOT_TOKEN) if BOT_TOKEN else None
dp = Dispatcher()


def fb_get(path):
    try:
        r = requests.get(FIREBASE + path + ".json", timeout=10)
        return r.json()
    except Exception as e:
        log.warning("fb_get " + path + ": " + str(e))
        return None


def fb_patch(path, data):
    try:
        requests.patch(FIREBASE + path + ".json", json=data, timeout=10)
    except Exception as e:
        log.warning("fb_patch " + path + ": " + str(e))


def fb_put(path, data):
    try:
        requests.put(FIREBASE + path + ".json", json=data, timeout=10)
    except Exception as e:
        log.warning("fb_put " + path + ": " + str(e))


def cp_request(method, payload):
    url = CRYPTOPAY_API + "/" + method
    headers = {
        "Crypto-Pay-API-Token": CRYPTOPAY_TOKEN,
        "Content-Type": "application/json",
    }
    r = requests.post(url, json=payload, headers=headers, timeout=15)
    return r.json()


def calc_max_coupons(plan):
    if plan in BIG_TARIFFS:
        return 3
    return 1


def apply_discount(price_usd, plan, use10, use20):
    max_c = calc_max_coupons(plan)
    if use10 + use20 > max_c:
        keep20 = min(use20, max_c)
        keep10 = min(use10, max_c - keep20)
        use10, use20 = keep10, keep20
    discount_pct = use10 * 10 + use20 * 20
    if discount_pct > 50:
        discount_pct = 50
    final = price_usd * (1 - discount_pct / 100)
    return round(final, 2), discount_pct, use10, use20


if bot:

    @dp.message(Command("start"))
    async def cmd_start(message: Message):
        args = message.text.split()
        ref_id = None
        if len(args) > 1 and args[1].startswith("ref_"):
            ref_id = args[1][4:]

        kb = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text="Открыть бюджет",
                web_app=WebAppInfo(url=MINI_APP_URL),
            )
        ]])

        user_id = str(message.from_user.id)
        now_ms = int(datetime.utcnow().timestamp() * 1000)

        if ref_id and ref_id != user_id:
            existing = fb_get("/users/" + user_id) or {}
            if not existing.get("referredBy"):
                fb_patch("/users/" + user_id, {"referredBy": ref_id, "referredAt": now_ms})
                refs = fb_get("/users/" + ref_id + "/referrals") or {}
                refs[user_id] = now_ms
                fb_put("/users/" + ref_id + "/referrals", refs)
                count = len(refs)
                tiers = [1, 5, 10, 20, 40, 80, 160, 320, 640, 1280]
                earned = 0
                for t in tiers:
                    if count >= t:
                        earned += 1
                fb_patch("/users/" + ref_id, {"referralCount": count, "couponsEarned": earned})

        existing = fb_get("/users/" + user_id) or {}
        upd = {
            "name": message.from_user.first_name or "Гость",
            "username": message.from_user.username or "",
            "tgId": user_id,
            "lastSeen": now_ms,
        }
        if not existing.get("firstSeen"):
            upd["firstSeen"] = now_ms
            upd["tariff"] = "trial"
            upd["subStart"] = now_ms
            upd["subEnd"] = now_ms + 30 * 24 * 60 * 60 * 1000
            upd["status"] = "active"
        fb_patch("/users/" + user_id, upd)

        await message.answer(
            "Привет! Это <b>Family Budget</b> — учёт доходов и расходов.\n\n"
            "Нажми кнопку, чтобы открыть приложение.",
            reply_markup=kb,
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
        u = fb_get("/users/" + uid) or {}
        tariff = u.get("tariff") or "trial"
        sub_end = u.get("subEnd") or 0
        now_ms = int(datetime.utcnow().timestamp() * 1000)
        days_left = 0
        if sub_end > now_ms:
            days_left = (sub_end - now_ms) // 86400000
        status = "активна" if sub_end > now_ms else "истекла"
        await message.answer(
            "📊 <b>Подписка</b>\n\n"
            "Тариф: " + tariff + "\n"
            "Статус: " + status + "\n"
            "Осталось: " + str(days_left) + " дней"
        )

    @dp.message(Command("referrals"))
    async def cmd_referrals(message: Message):
        uid = str(message.from_user.id)
        me = fb_get("/users/" + uid) or {}
        refs = me.get("referrals") or {}
        count = me.get("referralCount") or 0
        coupons10 = me.get("couponsEarned") or 0
        coupons20 = me.get("coupons20Earned") or 0

        if not refs:
            await message.answer(
                "👥 <b>Рефералы</b>\n\n"
                "Пока никого не пригласил.\n\n"
                "Твоя ссылка:\n"
                "<code>https://t.me/moneyfamilybudget_bot?start=ref_" + uid + "</code>",
                parse_mode="HTML",
            )
            return

        lines = ["👥 <b>Твои рефералы</b>", ""]
        total_paid = 0
        i = 0
        for ref_id in refs:
            i += 1
            ru = fb_get("/users/" + ref_id) or {}
            name = ru.get("name") or ("id " + ref_id)
            uname = ("@" + ru.get("username")) if ru.get("username") else ""
            tariff = ru.get("tariff") or "trial"
            paid = ru.get("paidAmount") or 0
            total_paid += paid
            sub_end = ru.get("subEnd") or 0
            now_ms = int(datetime.utcnow().timestamp() * 1000)
            status = "активна" if sub_end > now_ms else "истекла"
            lines.append(
                str(i) + ". <b>" + name + "</b> " + uname + "\n"
                "   Тариф: " + tariff + " · " + status + "\n"
                "   Купил на: " + str(paid) + " ₴"
            )

        lines.append("")
        lines.append("Всего рефералов: <b>" + str(count) + "</b>")
        lines.append("Купонов 10%: <b>" + str(coupons10) + "</b>")
        lines.append("Купонов 20%: <b>" + str(coupons20) + "</b>")
        lines.append("Рефералы купили на <b>$" + str(round(total_paid)) + "</b>")

        await message.answer("\n".join(lines), parse_mode="HTML")


async def daily_check():
    while True:
        try:
            await asyncio.sleep(6 * 60 * 60)
            if not bot:
                continue
            now_ms = int(datetime.utcnow().timestamp() * 1000)
            users = fb_get("/users") or {}
            log.info("daily_check: users=" + str(len(users)))
            for uid, u in users.items():
                if not isinstance(u, dict):
                    continue
                sub_end = u.get("subEnd") or 0
                if sub_end <= now_ms:
                    continue
                days = (sub_end - now_ms) // 86400000
                sent_flag = u.get("reminderSent") or 0
                log.info("check " + str(uid) + ": days=" + str(days) + " sent=" + str(sent_flag))
                if days >= 1 and days <= 3 and sent_flag < 3:
                    try:
                        await bot.send_message(
                            str(uid),
                            "⏰ Подписка истекает через <b>" + str(days) + " дн.</b>\n\n"
                            "Продлить: открой приложение → ⚙️ Настройки → Оплатить.",
                            parse_mode="HTML"
                        )
                    except Exception as e:
                        log.warning("reminder send " + str(uid) + ": " + str(e))
                    fb_patch("/users/" + str(uid), {"reminderSent": 3})
                elif days == 0 and sent_flag < 1:
                    try:
                        await bot.send_message(
                            str(uid),
                            "⏰ Подписка истекает <b>сегодня</b>.\n\n"
                            "Продлить: ⚙️ Настройки → Оплатить.",
                            parse_mode="HTML"
                        )
                    except Exception as e:
                        log.warning("reminder send " + str(uid) + ": " + str(e))
                    fb_patch("/users/" + str(uid), {"reminderSent": 1})
                elif days > 3 and sent_flag > 0:
                    fb_patch("/users/" + str(uid), {"reminderSent": 0})
        except Exception as e:
            log.warning("daily_check: " + str(e))


STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if bot:
        task = asyncio.create_task(dp.start_polling(bot))
        reminder_task = asyncio.create_task(daily_check())
        log.info("bot started")
        yield
        task.cancel()
        reminder_task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        try:
            await reminder_task
        except asyncio.CancelledError:
            pass
        await bot.session.close()
    else:
        yield


app = FastAPI(lifespan=lifespan)


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.get("/api/routes")
async def routes_list():
    result = []
    for r in app.routes:
        if hasattr(r, "path") and hasattr(r, "methods"):
            result.append({"path": r.path, "methods": list(r.methods)})
    return result


@app.get("/api/pay/debug")
async def pay_debug():
    token_set = bool(CRYPTOPAY_TOKEN)
    token_len = len(CRYPTOPAY_TOKEN) if CRYPTOPAY_TOKEN else 0
    token_preview = (CRYPTOPAY_TOKEN[:8] + "...") if CRYPTOPAY_TOKEN else "no"
    result = {
        "token_set": token_set,
        "token_len": token_len,
        "token_preview": token_preview,
        "network": CRYPTOPAY_NETWORK,
        "admin_set": bool(ADMIN_CHAT_ID),
    }
    if CRYPTOPAY_TOKEN:
        try:
            test = cp_request("getMe", {})
            result["cryptopay_ok"] = test.get("ok")
            result["cryptopay_result"] = test.get("result") or test
        except Exception as e:
            result["cryptopay_ok"] = False
            result["cryptopay_error"] = str(e)
    return result


@app.get("/api/pay/test-webhook")
async def pay_test_webhook(uid: str = "", plan: str = "1month", key: str = ""):
    if not TEST_WEBHOOK_KEY:
        return {"error": "TEST_WEBHOOK_KEY not set"}
    if key != TEST_WEBHOOK_KEY:
        return {"error": "wrong key"}
    if not uid or plan not in TARIFFS:
        return {"error": "need uid and valid plan"}

    fake_body = {
        "update_type": "invoice_paid",
        "payload": {
            "invoice_id": 999999,
            "status": "paid",
            "amount": str(TARIFFS[plan]["price_usd"]),
            "asset": CRYPTOPAY_NETWORK,
            "payload": json.dumps({
                "uid": uid,
                "plan": plan,
                "use10": 0,
                "use20": 0,
                "discount": 0,
                "base": TARIFFS[plan]["price_usd"],
                "final": TARIFFS[plan]["price_usd"],
            }),
        },
    }

    class FakeRequest:
        async def json(self):
            return fake_body

    return await pay_webhook(FakeRequest())


@app.post("/api/pay/create")
async def pay_create(request: Request):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "bad json"}, status_code=400)

    uid = str(body.get("uid", "")).strip()
    plan = str(body.get("plan", "")).strip()
    use10 = int(body.get("use10", 0) or 0)
    use20 = int(body.get("use20", 0) or 0)

    if not uid or plan not in TARIFFS:
        return JSONResponse({"error": "bad request"}, status_code=400)

    if not CRYPTOPAY_TOKEN:
        return JSONResponse({"error": "cryptopay not configured"}, status_code=500)

    try:
        u = fb_get("/users/" + uid) or {}
        have10 = u.get("couponsEarned") or 0
        have20 = u.get("coupons20Earned") or 0
        used10 = u.get("couponsUsed10") or 0
        used20 = u.get("couponsUsed20") or 0
        free10 = max(0, have10 - used10)
        free20 = max(0, have20 - used20)

        use10 = min(use10, free10)
        use20 = min(use20, free20)

        base_price = TARIFFS[plan]["price_usd"]
        final_usd, discount_pct, use10, use20 = apply_discount(base_price, plan, use10, use20)

        payload = json.dumps({
            "uid": uid,
            "plan": plan,
            "use10": use10,
            "use20": use20,
            "discount": discount_pct,
            "base": base_price,
            "final": final_usd,
        })

        cp_resp = cp_request("createInvoice", {
            "asset": CRYPTOPAY_NETWORK,
            "amount": str(final_usd),
            "description": "Family Budget — " + TARIFFS[plan]["name"],
            "payload": payload,
            "allow_comments": False,
            "allow_anonymous": False,
        })

        if not cp_resp.get("ok"):
            log.warning("cryptopay create: " + str(cp_resp))
            return JSONResponse({"error": str(cp_resp.get("error") or cp_resp)}, status_code=500)

        inv = cp_resp["result"]
        url = inv.get("bot_invoice_url") or inv.get("mini_app_invoice_url")
        return {
            "ok": True,
            "invoice_url": url,
            "invoice_id": inv.get("invoice_id"),
            "final_usd": final_usd,
            "discount_pct": discount_pct,
            "network": CRYPTOPAY_NETWORK,
        }
    except Exception as e:
        log.warning("pay_create: " + str(e))
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/pay/webhook")
async def pay_webhook(request: Request):
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": False}, status_code=400)

    if body.get("update_type") != "invoice_paid":
        return {"ok": True}

    inv = body.get("payload", {})
    payload_str = inv.get("payload") or "{}"
    try:
        meta = json.loads(payload_str)
    except Exception:
        return {"ok": True}

    uid = meta.get("uid")
    plan = meta.get("plan")
    use10 = int(meta.get("use10", 0) or 0)
    use20 = int(meta.get("use20", 0) or 0)
    final_usd = meta.get("final", 0)

    if not uid or plan not in TARIFFS:
        return {"ok": True}

    try:
        days = TARIFFS[plan]["days"]
        now_ms = int(datetime.utcnow().timestamp() * 1000)

        u = fb_get("/users/" + uid) or {}
        cur_end = u.get("subEnd") or now_ms
        if cur_end < now_ms:
            cur_end = now_ms
        new_end = cur_end + days * 86400000

        cur_used10 = u.get("couponsUsed10") or 0
        cur_used20 = u.get("couponsUsed20") or 0

        upd = {
            "tariff": plan,
            "subStart": now_ms,
            "subEnd": new_end,
            "status": "active",
            "paidAmount": (u.get("paidAmount") or 0) + final_usd,
            "couponsUsed10": cur_used10 + use10,
            "couponsUsed20": cur_used20 + use20,
            "reminderSent": 0,
        }
        fb_patch("/users/" + uid, upd)

        referred_by = u.get("referredBy")
        if referred_by:
            refs = fb_get("/users/" + referred_by + "/referrals") or {}
            total_spent = 0
            for ref_id in refs:
                ru = fb_get("/users/" + ref_id) or {}
                total_spent += ru.get("paidAmount") or 0
            milestones = int(total_spent // 150)
            rbu = fb_get("/users/" + referred_by) or {}
            got = rbu.get("coupons20Earned") or 0
            if milestones > got:
                fb_patch("/users/" + referred_by, {"coupons20Earned": milestones})
                if bot:
                    try:
                        await bot.send_message(
                            referred_by,
                            "🎉 Твои рефералы купили на $" + str(round(total_spent)) +
                            " — получил купон 20%!",
                            parse_mode="HTML"
                        )
                    except Exception:
                        pass

        if bot:
            try:
                await bot.send_message(
                    uid,
                    "✅ <b>Оплата получена!</b>\n\n"
                    "Тариф: " + TARIFFS[plan]["name"] + "\n"
                    "Сумма: $" + str(final_usd) + "\n"
                    "Активен до: " + datetime.fromtimestamp(new_end / 1000).strftime("%d.%m.%Y") + "\n\n"
                    "Открой приложение — всё готово.",
                    parse_mode="HTML"
                )
            except Exception:
                pass

        if bot and ADMIN_CHAT_ID:
            try:
                await bot.send_message(
                    ADMIN_CHAT_ID,
                    "💰 <b>Оплата</b>\n"
                    "ID: " + str(uid) + "\n"
                    "Тариф: " + TARIFFS[plan]["name"] + "\n"
                    "Сумма: $" + str(final_usd) + " (скидка " + str(meta.get("discount", 0)) + "%)",
                    parse_mode="HTML"
                )
            except Exception:
                pass

        return {"ok": True}
    except Exception as e:
        log.warning("webhook: " + str(e))
        return {"ok": False}


if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
else:
    @app.get("/")
    async def root():
        return HTMLResponse("<h1>Money Mini</h1>")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("bot:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
