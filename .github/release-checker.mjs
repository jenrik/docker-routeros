#!/usr/bin/env node

console.assert(process.env.GITHUB_TOKEN);
var GITHUB_TOKEN = process.env.GITHUB_TOKEN;

import { context, getOctokit } from "@actions/github";
import axios from "axios";
import xml from "xml2js";

var rssFeeds = [
	"https://mikrotik.com/candidate.rss", // testing
	//"https://mikrotik.com/bugfix.rss", // long-term
	"https://mikrotik.com/current.rss", // stable
	//"https://mikrotik.com/development.rss", // development
	"https://mikrotik.com/development.rss", // all
];

var brokenVersions = [
  "6.49.7",
  "7.6",
  "7.6rc3",
  "7.7beta3",
  "7.7beta4",
  "7.7beta6",
  "7.7beta8",
  "7.7beta9",
];

// Check existing images in ghcr.io
var ghcrAuth = Buffer.from(GITHUB_TOKEN).toString('base64')
var tagsResp = await axios.get(
	"https://ghcr.io/v2/jenrik/docker-routeros/tags/list",
	{
		"headers": {
			"authorization": "Bearer " + ghcrAuth
		}
	})
if (tagsResp.status != 200) {
	throw Error("Failed to get tags from ghcr.io, bad status code")
}
var existingVersions = tagsResp.data["tags"]

// Check RSS feeds for new versions
var results = await Promise.all(rssFeeds.map(async (feedurl) => {
	var resp = await axios.get(feedurl)
	const data = await xml.parseStringPromise(resp.data)
  return data.rss.channel[0].item.map((item) => {
    var title = item.title[0]
    var version = title.match(/^RouterOS ([^ ]+)/)[1]
    return version
  })
}))

var missingVersions = results
  .flat() // Flatten versions list for each RSS feed
  .filter((v, i, a) => a.indexOf(v) === i) // Remove duplicates
  .filter((v, i, a) => existingVersions.indexOf(v) == -1) // Filter for versions that are missing a container image
  .filter((v, i, a) => brokenVersions.indexOf(v) == -1) // Filter versions that fails to build

console.log("missing versions: " + missingVersions.join(", "))

const octokit = getOctokit(GITHUB_TOKEN)
await Promise.all(missingVersions.map(async (version) => {
	await octokit.rest.actions.createWorkflowDispatch({
		owner: "jenrik",
		repo: "docker-routeros",
		workflow_id: "build.yml",
		ref: "master",
		inputs: {
			"ros_version": version
		}
	})
}))
