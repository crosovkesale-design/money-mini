# language: Python 3.11+, file: bot.py
import os
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
        kb = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text="📊 Открыть бюджет",
                web_app=WebAppInfo(url=MINI_APP_URL),
            )
        ]])
        await message.answer(
            "Привет! Это <b>Family Budget</b> — учёт доходов и расходов "
            "для тебя и семьи.\n\n"
            "Нажми кнопку, чтобы открыть приложение.",
            reply_markup=kb,
        )

    @dp.message(Command("help"))
    async def cmd_help(message: Message):
        await message.answer(
            "/start — открыть бюджет\n"
            "/help — справка\n"
            "/status — подписка"
        )

    @dp.message(Command("status"))
    async def cmd_status(message: Message):
        await message.answer("📊 Подписка: бесплатный просмотр")


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
  
