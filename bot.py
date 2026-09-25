# language: Python 3.11+, file: bot.py
import os
import requests
import asyncio
import logging
from contextlib import asynccontextmanager

from aiogram import Bot, Dispatcher
from aiogram.types import Message, WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.filters import Command
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
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

if not BOT_TOKEN:
    log.warning("BOT_TOKEN не задан — бот не запустится, только API")

bot = Bot(token=BOT_TOKEN) if BOT_TOKEN else None
dp = Dispatcher()


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

        if ref_id and ref_id != user_id:
            try:
                base = "https://money-family-f9d8b-default-rtdb.europe-west1.firebasedatabase.app"
                r = requests.get(base + "/users/" + user_id + ".json", timeout=10)
                existing = r.json()
                if not existing or not existing.get("referredBy"):
                    now_ms = int(__import__("time").time() * 1000)
                    requests.patch(
                        base + "/users/" + user_id + ".json",
                        json={"referredBy": ref_id, "referredAt": now_ms},
                        timeout=10,
                    )
                    r2 = requests.get(base + "/users/" + ref_id + "/referrals.json", timeout=10)
                    refs = r2.json() or {}
                    refs[user_id] = now_ms
                    requests.put(
                        base + "/users/" + ref_id + "/referrals.json",
                        json=refs,
                        timeout=10,
                    )
                    count = len(refs)
                    tiers = [1, 5, 10, 20, 40, 80, 160, 320, 640, 1280]
                    earned = 0
                    for t in tiers:
                        if count >= t:
                            earned = earned + 1
                    requests.patch(
                        base + "/users/" + ref_id + ".json",
                        json={"referralCount": count, "couponsEarned": earned},
                        timeout=10,
                    )
            except Exception as e:
                log.warning("referral save: " + str(e))

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
        base = "https://money-family-f9d8b-default-rtdb.europe-west1.firebasedatabase.app"
        try:
            r = requests.get(base + "/users/" + uid + ".json", timeout=10)
            u = r.json() or {}
            tariff = u.get("tariff") or "trial"
            sub_end = u.get("subEnd") or 0
            now_ms = int(__import__("time").time() * 1000)
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
        except Exception as e:
            log.warning("status cmd: " + str(e))
            await message.answer("📊 Подписка: информация недоступна")

    @dp.message(Command("referrals"))
    async def cmd_referrals(message: Message):
        uid = str(message.from_user.id)
        base = "https://money-family-f9d8b-default-rtdb.europe-west1.firebasedatabase.app"
        try:
            r = requests.get(base + "/users/" + uid + ".json", timeout=10)
            me = r.json() or {}
            refs = me.get("referrals") or {}
            count = me.get("referralCount") or 0
            coupons = me.get("couponsEarned") or 0

            if not refs:
                await message.answer(
                    "👥 <b>Рефералы</b>\n\n"
                    "Пока никого не пригласил.\n\n"
                    "Твоя ссылка:\n"
                    "<code>https://t.me/moneyfamilybudget_bot?start=ref_" + uid + "</code>"
                )
                return

            lines = ["👥 <b>Твои рефералы</b>", ""]
            total_paid = 0
            i = 0
            for ref_id in refs:
                i += 1
                rr = requests.get(base + "/users/" + ref_id + ".json", timeout=10)
                ru = rr.json() or {}
                name = ru.get("name") or ("id " + ref_id)
                uname = ("@" + ru.get("username")) if ru.get("username") else ""
                tariff = ru.get("tariff") or "trial"
                paid = ru.get("paidAmount") or 0
                total_paid += paid
                sub_end = ru.get("subEnd") or 0
                now_ms = int(__import__("time").time() * 1000)
                status = "активна" if sub_end > now_ms else "истекла"

                lines.append(
                    str(i) + ". <b>" + name + "</b> " + uname + "\n"
                    "   Тариф: " + tariff + " · " + status + "\n"
                    "   Купил на: " + str(paid) + " ₴"
                )

            lines.append("")
            lines.append("Всего рефералов: <b>" + str(count) + "</b>")
            lines.append("Купонов: <b>" + str(coupons) + "</b> (−10% каждый)")
            lines.append("Суммарно купили на <b>" + str(total_paid) + " ₴</b>")

            await message.answer("\n".join(lines), parse_mode="HTML")
        except Exception as e:
            log.warning("referrals cmd: " + str(e))
            await message.answer("Ошибка загрузки. Попробуй позже.")


STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if bot:
        task = asyncio.create_task(dp.start_polling(bot))
        log.info("бот запущен")
        yield
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        await bot.session.close()
    else:
        yield


app = FastAPI(lifespan=lifespan)


@app.get("/api/health")
async def health():
    return {"ok": True}


if os.path.isdir(STATIC_DIR):
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
else:
    @app.get("/")
    async def root():
        return HTMLResponse("<h1>Money Mini — soon</h1>")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("bot:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
