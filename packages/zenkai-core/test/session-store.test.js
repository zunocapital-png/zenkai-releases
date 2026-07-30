"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bun_test_1 = require("bun:test");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const store_ts_1 = require("../src/session/store.ts");
(0, bun_test_1.describe)("SessionStore · Fase 1", () => {
    (0, bun_test_1.test)("create + get session", () => {
        var _a;
        const s = new store_ts_1.SessionStore();
        const sess = s.createSession({ id: "abc", title: "Prueba" });
        (0, bun_test_1.expect)(sess.id).toBe("abc");
        (0, bun_test_1.expect)(sess.title).toBe("Prueba");
        (0, bun_test_1.expect)((_a = s.getSession("abc")) === null || _a === void 0 ? void 0 : _a.title).toBe("Prueba");
    });
    (0, bun_test_1.test)("listSessions ordena por updatedAt desc", async () => {
        const s = new store_ts_1.SessionStore();
        s.createSession({ id: "vieja", title: "V", createdAt: 100 });
        await new Promise((r) => setTimeout(r, 5));
        s.createSession({ id: "nueva", title: "N" });
        const list = s.listSessions();
        (0, bun_test_1.expect)(list[0].id).toBe("nueva");
        (0, bun_test_1.expect)(list[1].id).toBe("vieja");
    });
    (0, bun_test_1.test)("append + get messages", () => {
        const s = new store_ts_1.SessionStore();
        s.createSession({ id: "chat1" });
        s.appendMessage("chat1", { role: "user", parts: [{ type: "text", text: "hola" }] });
        s.appendMessage("chat1", { role: "assistant", parts: [{ type: "text", text: "buenas" }] });
        const msgs = s.getMessages("chat1");
        (0, bun_test_1.expect)(msgs.length).toBe(2);
        (0, bun_test_1.expect)(msgs[0].role).toBe("user");
        (0, bun_test_1.expect)(msgs[1].role).toBe("assistant");
        const part0 = msgs[0].parts[0];
        (0, bun_test_1.expect)(part0.type).toBe("text");
        if (part0.type === "text")
            (0, bun_test_1.expect)(part0.text).toBe("hola");
    });
    (0, bun_test_1.test)("appendMessage sin sesión tira error", () => {
        const s = new store_ts_1.SessionStore();
        (0, bun_test_1.expect)(() => s.appendMessage("no-existe", { role: "user", parts: [] })).toThrow();
    });
    (0, bun_test_1.test)("update session actualiza updatedAt", async () => {
        const s = new store_ts_1.SessionStore();
        const antes = s.createSession({ id: "u1" });
        await new Promise((r) => setTimeout(r, 5));
        const despues = s.updateSession("u1", { title: "renombrado" });
        (0, bun_test_1.expect)(despues === null || despues === void 0 ? void 0 : despues.title).toBe("renombrado");
        (0, bun_test_1.expect)(despues.updatedAt).toBeGreaterThan(antes.updatedAt);
    });
    (0, bun_test_1.test)("deleteSession limpia sesión y mensajes", () => {
        const s = new store_ts_1.SessionStore();
        s.createSession({ id: "borra" });
        s.appendMessage("borra", { role: "user", parts: [] });
        (0, bun_test_1.expect)(s.deleteSession("borra")).toBe(true);
        (0, bun_test_1.expect)(s.getSession("borra")).toBeUndefined();
        (0, bun_test_1.expect)(s.getMessages("borra")).toEqual([]);
    });
    (0, bun_test_1.test)("clearMessages vacía sin borrar la sesión", () => {
        const s = new store_ts_1.SessionStore();
        s.createSession({ id: "clean" });
        s.appendMessage("clean", { role: "user", parts: [] });
        s.clearMessages("clean");
        (0, bun_test_1.expect)(s.getSession("clean")).toBeDefined();
        (0, bun_test_1.expect)(s.getMessages("clean")).toEqual([]);
    });
    (0, bun_test_1.test)("persistencia a disco: se puede recargar", () => {
        const dir = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "zenkai-core-test-"));
        try {
            // Store A: escribe.
            const a = new store_ts_1.SessionStore({ persistDir: dir });
            a.createSession({ id: "persistente", title: "Sesión con disco" });
            a.appendMessage("persistente", { role: "user", parts: [{ type: "text", text: "hola disco" }] });
            // Store B: nuevo, carga desde el mismo dir.
            const b = new store_ts_1.SessionStore({ persistDir: dir });
            const sess = b.getSession("persistente");
            (0, bun_test_1.expect)(sess === null || sess === void 0 ? void 0 : sess.title).toBe("Sesión con disco");
            const msgs = b.getMessages("persistente");
            (0, bun_test_1.expect)(msgs.length).toBe(1);
            const p = msgs[0].parts[0];
            if (p.type === "text")
                (0, bun_test_1.expect)(p.text).toBe("hola disco");
        }
        finally {
            (0, node_fs_1.rmSync)(dir, { recursive: true, force: true });
        }
    });
});
//# sourceMappingURL=session-store.test.js.map