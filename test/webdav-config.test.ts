import { resolveEffectiveWebdavAddress } from "../app/utils/cloud/webdav-config";

describe("effective WebDAV address", () => {
  test("uses UCAN runtime config over stale persisted config", () => {
    expect(
      resolveEffectiveWebdavAddress(
        {
          authType: "ucan",
          baseUrl: "https://warehouse.example.com",
          prefix: "",
          endpoint: "",
        },
        "https://warehouse.example.com",
        "/dav",
      ),
    ).toEqual({
      baseUrl: "https://warehouse.example.com",
      prefix: "/dav",
    });
  });

  test("keeps custom Basic WebDAV config", () => {
    expect(
      resolveEffectiveWebdavAddress(
        {
          authType: "basic",
          baseUrl: "https://storage.example.com/custom",
          prefix: "",
          endpoint: "",
        },
        "https://warehouse.example.com",
        "/dav",
      ),
    ).toEqual({
      baseUrl: "https://storage.example.com",
      prefix: "/custom",
    });
  });

  test("keeps the legacy UCAN endpoint as a fallback without runtime config", () => {
    expect(
      resolveEffectiveWebdavAddress({
        authType: "ucan",
        baseUrl: "",
        prefix: "",
        endpoint: "https://legacy.example.com/dav",
      }),
    ).toEqual({
      baseUrl: "https://legacy.example.com",
      prefix: "/dav",
    });
  });
});
