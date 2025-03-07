"use server";

import { fetchGET } from '@/lib/utils';

const HEADERS = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` };

async function fetchRepoData(url: string): Promise<RawRepoInfo> {

  console.log(`Attempting to get repository data for URL: ${url}...`);

  if (!url || !url.includes("github.com")) {
    throw new Error("Invalid GitHub URL");
  }

  const urlParts: string[] = url.split("github.com/")[1]?.split('/') || [];
  const repoOwner: string = urlParts[0];
  const repoName: string = urlParts[1];

  if (!repoOwner || !repoName) {
    throw new Error("Invalid repository URL format");
  }

  const repoInfo = await fetchGET(`https://api.github.com/repos/${repoOwner}/${repoName}`, HEADERS);
  const repoDefaultBranch: string = repoInfo?.default_branch ?? null;

  if (!repoDefaultBranch) {
    throw new Error("Invalid repository branch");
  }

  const rawRepo: RawRepo | null = await fetchGET(`https://api.github.com/repos/${repoOwner}/${repoName}/git/trees/${repoDefaultBranch}?recursive=1`, HEADERS);

  if (!rawRepo) {
    throw new Error("Error fetching repository.");
  }

  const rawRepoInfo: RawRepoInfo = {
    repoOwner,
    repoName,
    repoDefaultBranch,
    rawRepo
  };
  console.log("\nrawRepoInfo:");
  console.log(rawRepoInfo);
  console.log("");

  return rawRepoInfo;

}

async function restructureRawRepo({
  repoOwner,
  repoName,
  repoDefaultBranch,
  rawRepo
}: RawRepoInfo): Promise<RawRepoRecord> {
  
  let rawRepoRecord: RawRepoRecord = {};
  
  for (const rawRepoNode of rawRepo.tree) {
    
    if (rawRepoNode.type === "tree") {
      continue;
    }

    console.log(`Processing file: ${rawRepoNode.path}...`);
    const breadcrumb: string[] = rawRepoNode.path.split('/');
    let tempRecord = JSON.parse(JSON.stringify(rawRepoRecord));
    
    for (const folder of breadcrumb) {
      if (folder === breadcrumb[-1]) {
        const fileContent: string = await fetchGET(
          `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${repoDefaultBranch}/${rawRepoNode.path}`,
          HEADERS);
        tempRecord[folder] = fileContent ?? "";
        continue;
      }
      if (!tempRecord[folder]) {
        tempRecord[folder] = {};
      }
      tempRecord = tempRecord[folder];
    }
    rawRepoRecord = tempRecord;
  }

  return rawRepoRecord;

}

function convertToParsedRepo(rawRepoRecord: RawRepoRecord, basePath: string = ""): ParsedRepo {
  
  const parsedRepo: ParsedRepo = [];
  
  for (const [name, content] of Object.entries(rawRepoRecord)) {
    
    const path = basePath ? `${basePath}/${name}` : name;
    
    if (typeof content === "object" && content !== null) {
      // This is a directory
      parsedRepo.push({
        path: path,
        type: "tree",
        content: convertToParsedRepo(content, path)
      });
    } else {
      // This is a file
      parsedRepo.push({
        path: path,
        type: "blob",
        content: (typeof content === "string") ? content : ""
      });
    }

  }

  console.log(`Finished processing repository. Total file nodes: ${parsedRepo.length}`);
  return parsedRepo;

}

export default async function getRepo(url: string): Promise<ParsedRepo> {
  const rawRepoInfo: RawRepoInfo = await fetchRepoData(url);
  console.log("\n\n\nrawRepoInfo: ");
  console.log(rawRepoInfo);
  const restructuredRawRepo: RawRepoRecord = await restructureRawRepo(rawRepoInfo);
  console.log("\n\n\nrestructuredRawRepo: ");
  console.log(restructuredRawRepo);
  return convertToParsedRepo(restructuredRawRepo);
}
