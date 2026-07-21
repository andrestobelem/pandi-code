import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../../..");

function readRepoFile(path: string): string {
	return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("Pandi distribution packaging", () => {
	it("publishes the application as pandi-code", () => {
		const packageJson = JSON.parse(readRepoFile("packages/coding-agent/package.json")) as {
			name?: string;
			bin?: Record<string, string>;
			scripts?: Record<string, string>;
		};

		expect(packageJson.name).toBe("pandi-code");
		expect(packageJson.bin).toEqual({ pandi: "dist/cli.js" });
		expect(packageJson.scripts?.["build:binary"]).toContain("--outfile dist/pandi");
	});

	it("builds Pandi-named binaries and archives", () => {
		const buildScript = readRepoFile("scripts/build-binaries.sh");

		expect(buildScript).toContain("pandi-$platform.tar.gz");
		expect(buildScript).toContain("pandi-$platform.zip");
		expect(buildScript).toContain("$OUTPUT_DIR/$platform/pandi.exe");
		expect(buildScript).toContain("$OUTPUT_DIR/$platform/pandi");
		expect(buildScript).not.toContain("pi-$platform.tar.gz");
		expect(buildScript).not.toContain("pi-$platform.zip");
	});

	it("installs and publishes Pandi-named local release artifacts", () => {
		const localRelease = readRepoFile("scripts/local-release.mjs");
		const publishScript = readRepoFile("scripts/publish.mjs");
		const workflow = readRepoFile(".github/workflows/build-binaries.yml");

		expect(localRelease).toContain('{ directory: "packages/coding-agent", name: "pandi-code" }');
		expect(localRelease).toContain("function createPandiShim(installDirectory)");
		expect(localRelease).toContain(`\`pandi-\${platform}.tar.gz\``);
		expect(publishScript).toContain('{ directory: "packages/coding-agent", name: "pandi-code" }');
		expect(publishScript).not.toContain('{ directory: "packages/ai"');
		expect(publishScript).not.toContain('{ directory: "packages/agent"');
		expect(publishScript).not.toContain('{ directory: "packages/tui"');
		expect(publishScript).not.toContain('{ directory: "packages/storage/sqlite-node"');
		expect(workflow).toContain("pandi-darwin-arm64.tar.gz");
		expect(workflow).toContain("pandi-windows-arm64.zip");
		expect(workflow).toContain("pandi-code-install-package-lock.json");
		expect(workflow).not.toMatch(/\bpi-(?:darwin|linux|windows)-/);
	});
});
