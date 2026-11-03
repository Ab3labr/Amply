import { test, expect } from "@playwright/test";

test("the YouTube IFrame API loader requests its script only once", async ({ page, request }) => {
  const roomResponse = await request.post("/api/rooms", { data: { hostName: "Loader Host" } });
  const { roomCode } = await roomResponse.json();
  const queueResponse = await request.post(`/api/rooms/${roomCode}/queue`, {
    data: { videoId: "dQw4w9WgXcQ", title: "Loader Track" },
  });
  expect(queueResponse.ok()).toBeTruthy();

  let apiRequests = 0;
  await page.route("https://www.youtube.com/iframe_api", async (route) => {
    apiRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 200, contentType: "text/javascript", body: "window.YT = {};" });
  });
  await page.goto(`/host/${roomCode}`);
  await expect(page.getByRole("heading", { name: "Loader Track" })).toBeVisible();
  await page.waitForTimeout(700);

  expect(apiRequests).toBe(1);
});