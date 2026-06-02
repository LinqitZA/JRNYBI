/**
 * Tests for the "Explain this number" client helper (feature #218).
 *
 * We isolate the `fetchExplanation()` HTTP wrapper because the React surface
 * is a thin Popover around it — render testing of the button itself relies on
 * the e2e Playwright suite (the bash sandbox in this repo blocks DOM-test
 * harnesses like jsdom from spinning up reliably).
 */
import { fetchExplanation } from "./ExplainButton";

function jsonResponse(body: any, init: Partial<{ status: number; ok: boolean }> = {}) {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe("fetchExplanation", () => {
  test("POSTs JSON to /api/explain with same-origin credentials", async () => {
    const fakeFetch = jest.fn().mockResolvedValue(
      jsonResponse({ explanation: "ok", model: "claude-sonnet-4-5", cached: false })
    );
    const result = await fetchExplanation(
      { metric_label: "Revenue", metric_value: 100 },
      fakeFetch as any
    );

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = fakeFetch.mock.calls[0];
    expect(url).toBe("/api/explain");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const sent = JSON.parse(init.body);
    expect(sent.metric_label).toBe("Revenue");
    expect(sent.metric_value).toBe(100);

    expect(result.explanation).toBe("ok");
    expect(result.cached).toBe(false);
  });

  test("surfaces server-provided message on 4xx", async () => {
    const fakeFetch = jest.fn().mockResolvedValue(
      jsonResponse({ message: "Rate limit reached (60/hour)" }, { status: 429 })
    );
    await expect(
      fetchExplanation({ metric_label: "Revenue", metric_value: 100 }, fakeFetch as any)
    ).rejects.toMatchObject({
      message: "Rate limit reached (60/hour)",
      status: 429,
    });
  });

  test("falls back to a generic message when error body is non-JSON", async () => {
    const fakeFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response);
    await expect(
      fetchExplanation({ metric_label: "Revenue", metric_value: 100 }, fakeFetch as any)
    ).rejects.toMatchObject({
      message: "Request failed (500)",
      status: 500,
    });
  });

  test("503 carries through so the UI can show 'not configured'", async () => {
    const fakeFetch = jest.fn().mockResolvedValue(
      jsonResponse({ message: "Explain feature is not configured on this server." }, { status: 503 })
    );
    await expect(
      fetchExplanation({ metric_label: "Revenue", metric_value: 100 }, fakeFetch as any)
    ).rejects.toMatchObject({ status: 503 });
  });
});
