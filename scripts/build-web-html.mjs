#!/usr/bin/env node
// Build the final index.html with embedded data for GitHub Pages
import fs from "node:fs";

const template = fs.readFileSync("web/index.template.html", "utf-8");
const data = JSON.parse(fs.readFileSync("output/web-data.json", "utf-8"));

const final = template
  .replace("${JSON.stringify(matches)}", JSON.stringify(data.matches))
  .replace("${JSON.stringify(teams)}", JSON.stringify(data.teams));

fs.writeFileSync("web/index.html", final);
console.log("Built web/index.html with " + data.matches.length + " matches embedded.");
