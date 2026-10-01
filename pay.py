import httpx

CRYPTOPAY_API = "https://pay.crypt.bot/api"


class CryptoPay:
    def __init__(self, token: str):
        self.token = token

    async def call(self, method: str, payload: dict | None = None) -> dict:
        if not self.token:
            return {"ok": False, "error": "no token"}
        headers = {
            "Crypto-Pay-API-Token": self.token,
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(f"{CRYPTOPAY_API}/{method}", json=payload or {}, headers=headers)
            return r.json()
