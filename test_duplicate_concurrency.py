import asyncio
import os

import httpx

API_URL = os.getenv("API_URL", "http://127.0.0.1:8000")
TOKEN = os.getenv("HTI_TEST_TOKEN")

TEST_URL = "https://concurrency-test.example.com/login"
REQUESTS = 10


async def main():
    if not TOKEN:
        print("Erreur : définis la variable HTI_TEST_TOKEN.")
        return

    headers = {"Authorization": f"Bearer {TOKEN}"}

    payload = {
        "resource_type": "url",
        "value": TEST_URL,
        "threat_type": "phishing",
        "description": "Signalement de test de concurrence HTI.",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        responses = await asyncio.gather(
            *[
                client.post(
                    f"{API_URL}/api/v1/reports",
                    json=payload,
                    headers=headers,
                )
                for _ in range(REQUESTS)
            ],
            return_exceptions=True,
        )

    success = []
    failures = []

    for response in responses:
        if isinstance(response, Exception):
            failures.append(str(response))
            continue

        if response.status_code == 201:
            success.append(response.json())
        else:
            failures.append(
                f"HTTP {response.status_code}: {response.text}"
            )

    print(f"Requêtes envoyées : {REQUESTS}")
    print(f"Succès : {len(success)}")
    print(f"Échecs : {len(failures)}")

    for result in success:
        print(result)

    if failures:
        print("\nErreurs :")
        for failure in failures:
            print(failure)

    indicator_ids = {
        result["indicator_id"] for result in success
    }
    report_ids = {
        result["id"] for result in success
    }

    print("\nIndicateurs distincts :", len(indicator_ids))
    print("IDs de signalement distincts :", len(report_ids))

    if (
        len(success) == REQUESTS
        and len(indicator_ids) == 1
        and len(report_ids) == REQUESTS
    ):
        print("TEST RÉUSSI : tous les signalements partagent un indicateur.")
    else:
        print("TEST NON VALIDÉ : examiner les erreurs et la base.")


if __name__ == "__main__":
    asyncio.run(main())
