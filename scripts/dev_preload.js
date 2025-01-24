const fs = require("fs");
const versionString = require("../package.json").version + "-dev";

fs.writeFileSync(
  __dirname + "/../src/version.ts",
  `export const version = "${versionString}"`
);
