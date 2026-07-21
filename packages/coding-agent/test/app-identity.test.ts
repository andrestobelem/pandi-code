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
} from "../src/config.ts";

describe("Pandi application identity", () => {
	it("uses Pandi names for the application and configuration", () => {
		expect(APP_NAME).toBe("pandi");
		expect(APP_TITLE).toBe("pandi");
		expect(CONFIG_DIR_NAME).toBe(".pandi");
		expect(ENV_AGENT_DIR).toBe("PANDI_CODING_AGENT_DIR");
		expect(ENV_SESSION_DIR).toBe("PANDI_CODING_AGENT_SESSION_DIR");
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
