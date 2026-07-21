import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { printHelp } from "../src/cli/args.ts";
import {
	APP_NAME,
	APP_TITLE,
	CONFIG_DIR_NAME,
	ENV_AGENT_DIR,
	ENV_SESSION_DIR,
	getPackageJsonPath,
	isOfficialPiDistribution,
	PACKAGE_NAME,
} from "../src/config.ts";
import { getLatestPiRelease } from "../src/utils/version-check.ts";

describe("Pandi application identity", () => {
	it("uses Pandi names for the application and configuration", () => {
		expect(PACKAGE_NAME).toBe("pandi-code");
		expect(APP_NAME).toBe("pandi");
		expect(APP_TITLE).toBe("pandi");
		expect(CONFIG_DIR_NAME).toBe(".pandi");
		expect(ENV_AGENT_DIR).toBe("PANDI_CODING_AGENT_DIR");
		expect(ENV_SESSION_DIR).toBe("PANDI_CODING_AGENT_SESSION_DIR");
		expect(isOfficialPiDistribution()).toBe(false);
	});

	it("checks the Pandi npm package instead of the official Pi release API", async () => {
		const fetchMock = vi.fn(async () => Response.json({ version: "0.82.0" }));
		vi.stubGlobal("fetch", fetchMock);

		try {
			await expect(getLatestPiRelease("0.81.0")).resolves.toEqual({
				packageName: "pandi-code",
				version: "0.82.0",
			});
			expect(fetchMock).toHaveBeenCalledWith(
				"https://registry.npmjs.org/pandi-code/latest",
				expect.objectContaining({
					headers: expect.objectContaining({ "User-Agent": "pandi/0.81.0" }),
				}),
			);
			expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("pi.dev"), expect.anything());
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("exposes the Pandi executable", () => {
		const packageJson = JSON.parse(readFileSync(getPackageJsonPath(), "utf-8")) as {
			bin?: Record<string, string>;
		};

		expect(packageJson.bin).toEqual({ pandi: "dist/cli.js" });
	});

	it("shows Pandi in CLI help", () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});

		try {
			printHelp();
			const help = log.mock.calls.map(([message]) => String(message)).join("\n");
			expect(help).toContain("pandi - AI coding assistant");
			expect(help).toContain("pandi [options] [@files...] [messages...]");
		} finally {
			log.mockRestore();
		}
	});
});
