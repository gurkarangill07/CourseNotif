const fs = require("fs/promises");
const path = require("path");
const { createVsbBrowserSource, pickLatestJspFile } = require("./vsbBrowserSource");

async function collectFromDirectory(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(
      (name) =>
        name.toLowerCase().includes("getclassdata") &&
        name.toLowerCase().endsWith(".jsp")
    );

  const collected = [];
  for (const fileName of files) {
    const fullPath = path.join(dirPath, fileName);
    const stats = await fs.stat(fullPath);
    const jspBody = await fs.readFile(fullPath, "utf8");
    collected.push({
      fileName,
      jspBody,
      sourcePath: fullPath,
      payloadHash: null,
      generatedAt: stats.mtime
    });
  }

  return collected;
}

function createDbOrFilesystemSource(db, config) {
  return {
    async collectGetClassDataCandidates(_options = {}) {
      if (config.vsbSourceMode === "filesystem") {
        if (!config.jspSourceDir) {
          throw new Error(
            "JSP_SOURCE_DIR is required when VSB_SOURCE_MODE=filesystem."
          );
        }
        return collectFromDirectory(config.jspSourceDir);
      }

      const latest = await db.getSharedLatestJspFile();
      if (!latest) {
        return [];
      }

      return [
        {
          fileName: latest.file_name,
          jspBody: latest.jsp_body,
          sourcePath: latest.source_path,
          payloadHash: latest.payload_hash,
          generatedAt: latest.generated_at || latest.updated_at
        }
      ];
    },

    pickLatestJspFile,

    async initLoginSession() {
      throw new Error(
        "initLoginSession is only available when VSB_SOURCE_MODE=browser."
      );
    }
  };
}

function createVsbSource(db, config) {
  if (config.vsbSourceMode === "browser") {
    return createVsbBrowserSource(db, config);
  }
  return createDbOrFilesystemSource(db, config);
}

module.exports = {
  createVsbSource,
  pickLatestJspFile
};
