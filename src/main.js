const core = require('@actions/core');
const github = require('@actions/github');
const axios = require('axios');
const format = require('date-fns/format');
const add = require('date-fns/add');
const compareAsc = require('date-fns/compareAsc');
const { graphql } = require('@octokit/graphql');

const requiredArgOptions = {
  required: true,
  trimWhitespace: true
};

const ghLogin = core.getInput('github-login') || 'github-actions';
const ghToken = core.getInput('github-token', requiredArgOptions);
const branchCleanupStrategy = core.getInput('branch-cleanup-strategy', requiredArgOptions); //age or number
const tagCleanupStrategy = core.getInput('tag-cleanup-strategy', requiredArgOptions); //age or number
const shaCleanupStrategy = core.getInput('sha-cleanup-strategy', requiredArgOptions); //age or number
const branchThreshold = core.getInput('branch-threshold', requiredArgOptions); //number of days or number of releases
const tagThreshold = core.getInput('tag-threshold', requiredArgOptions); //number of days or number of releases
const shaThreshold = core.getInput('sha-threshold', requiredArgOptions); //number of days or number of releases
const projectBoardNumber = core.getInput('board-number', requiredArgOptions);

const owner = github.context.repo.owner;
const repo = github.context.repo.repo;
const orgAndRepo = `${owner}/${repo}`;
const octokit = github.getOctokit(ghToken);
const graphqlWithAuth = graphql.defaults({
  headers: {
    authorization: `token ${ghToken}`
  }
});

let activeTags = [];
let activeBranches = [];
let activeShas = [];

async function closeAndArchiveItem(title, issue_number, cardId) {
  //First archive the project card if one exists
  if (cardId && cardId !== 0) {
    core.info(`Archiving card #${cardId} for '${title}'`);
    await axios({
      method: 'PATCH',
      url: `https://api.github.com/projects/columns/cards/${cardId}`,
      headers: {
        'content-type': 'application/json',
        authorization: `token ${ghToken}`,
        accept: 'application/vnd.github.inertia-preview+json'
      },
      data: '{"archived" : true }'
    }).catch(error => {
      core.setFailed(`An error occurred archiving card ${cardId}: ${error.message}`);
    });
  }

  //Then close the issue
  core.info(`Closing issue #${issue_number} for '${title}'`);
  await octokit.rest.issues
    .update({
      owner,
      repo,
      issue_number,
      state: 'closed'
    })
    .catch(error => {
      core.setFailed(`An error occurred closing the issue: ${error.message}`);
    });
}

async function getAllActiveItemsOnTheBoard() {
  try {
    const query = `query {
        repository(owner: "${owner}", name: "${repo}") {
          issues(last: 100, orderBy: {field: UPDATED_AT, direction: DESC}, filterBy: {mentioned: "${ghLogin}", states: [OPEN]}) {
            edges {
              node {
                databaseId
                title
                number
                updatedAt
                labels(first: 20) {
                  edges {
                    node {
                      name
                    }
                  }
                }
                projectCards {
                  edges {
                    node {
                      databaseId
                      project {
                        number  
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      `;
    const response = await graphqlWithAuth(query);
    if (!response || !response.repository || !response.repository.issues || !response.repository.issues.edges) {
      throw new Error('An error occurred making the request to retrieve the active issues.');
    }
    if (response.repository.issues.edges.length === 0) {
      core.info(`The ${orgAndRepo} repository does not appear to have any issues.`);
      return [];
    }
    const activeRepoBranches = await getActiveBranches();

    response.repository.issues.edges.forEach(rawIssueNode => {
      const rawIssue = rawIssueNode.node;

      let issue = {
        id: rawIssue.databaseId,
        title: rawIssue.title,
        number: rawIssue.number,
        updatedAt: new Date(rawIssue.updatedAt),
        updatedAtString: (nowString = format(new Date(rawIssue.updatedAt), 'MM-dd-yyyy HH:mm')),
        labels: [],
        projectCardId: 0,
        refType: '',
        isCurrentlyDeployedToAnEnv: false,
        isAnActiveBranch: false
      };

      if (rawIssue.labels && rawIssue.labels.edges && rawIssue.labels.edges.length > 0) {
        issue.labels = rawIssue.labels.edges.filter(l => l.node.name.includes('🚀currently-in-')).map(l => l.node.name);
        issue.isCurrentlyDeployedToAnEnv = issue.labels && issue.labels.length > 0;
      }

      if (rawIssue.projectCards && rawIssue.projectCards.edges && rawIssue.projectCards.edges.length > 0) {
        const projectCard = rawIssue.projectCards.edges.find(pc => pc.node.project.number == projectBoardNumber);
        if (projectCard) {
          issue.projectCardId = projectCard.node.databaseId;
        }
      }

      if (rawIssue.title.toLowerCase().includes('tag deploy:')) {
        issue.refType = 'tag';
        activeTags.push(issue);
      } else if (rawIssue.title.toLowerCase().includes('branch deploy:')) {
        issue.refType = 'branch';
        activeBranches.push(issue);
        let branchRegex = /\[.*\] Branch Deploy: /i;
        const branchName = issue.title.replace(branchRegex, '').toLowerCase();
        issue.isAnActiveBranch = activeRepoBranches.includes(branchName);
      } else if (rawIssue.title.toLowerCase().includes('sha deploy:')) {
        issue.refType = 'sha';
        activeShas.push(issue);
      } else {
        core.info(`Issue #${issue.number} was retrieved but does not appear to be an automated project board issue.`);
      }
    });
  } catch (error) {
    core.setFailed(`An error occurred retrieving the cards: ${error.message}`);
  }
  return [];
}

async function getActiveBranches() {
  let activeBranches = [];
  await octokit
    .paginate(octokit.rest.repos.listBranches, {
      owner,
      repo
    })
    .then(branches => {
      if (branches.length === 0) {
        core.info(`There were no active branches on the ${orgAndRepo} repository.`);
      }
      activeBranches = branches.map(b => b.name.toLowerCase());
    })
    .catch(error => {
      core.setFailed(`An error occurred retrieving the active branches for ${orgAndRepo}: ${error.message}`);
    });
  return activeBranches;
}

async function figureOutItemsToRemoveByMaxAgeOfItems(activeItems, maxAgeInDays, cardType) {
  if (!activeItems || activeItems.length == 0) {
    core.info(`\nThere are no active ${cardType} cards.  Nothing to remove.`);
    return [];
  }

  //Only grab the inactive items (ones that are not currently deployed anywhere)
  let inactiveItems = activeItems.filter(i => !i.isCurrentlyDeployedToAnEnv);
  if (!inactiveItems || inactiveItems.length === 0) {
    core.info(`\nThere are no inactive ${cardType} cards to remove.`);
    return [];
  }

  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);

  const maxDate = add(now, {
    days: maxAgeInDays * -1
  });
  const maxDateString = format(maxDate, 'MM-dd-yyyy');

  //Grab anything older than the maxDate
  //1 if left is after right, 0 if they are the same, -1 if left is before right
  const itemsToKeep = inactiveItems.filter(i => compareAsc(i.updatedAt, maxDate) > -1);
  const itemsToRemove = inactiveItems.filter(i => compareAsc(i.updatedAt, maxDate) === -1);

  core.info(
    `\nInactive ${cardType} Cards to Keep based on Max Age of ${maxAgeInDays} Days (created after ${maxDateString}):`
  );
  if (itemsToKeep && itemsToKeep.length > 0) {
    itemsToKeep.forEach(b => core.info(`- ${b.updatedAtString} - ${b.title}`));
  } else {
    core.info(`- There are no inactive ${cardType} cards to keep`);
  }

  core.info(
    `\nInactive ${cardType} Cards to Remove based on Max Age of ${maxAgeInDays} Days (created before ${maxDateString}):`
  );
  if (itemsToRemove && itemsToRemove.length > 0) {
    itemsToRemove.forEach(b => core.info(`- ${b.updatedAtString} - ${b.title}`));
  } else {
    core.info(`- There are no inactive ${cardType} cards to cleanup`);
  }

  return itemsToRemove;
}

async function figureOutItemsToRemoveByMaxNumberOfItems(activeItems, maxNumberOfItems, cardType) {
  //Only grab the inactive items (ones that are not currently deployed anywhere and don't have an open branch)
  let inactiveItems = activeItems.filter(i => !i.isCurrentlyDeployedToAnEnv && !i.isAnActiveBranch);

  if (!inactiveItems || inactiveItems.length === 0) {
    core.info(`\nThere are no inactive ${cardType} cards to remove`);
    return [];
  }

  if (inactiveItems.length <= maxNumberOfItems) {
    core.info(
      `\nNothing to cleanup.  The number of inactive ${cardType} cards does not exceed the max number: ${inactiveItems.length}/${maxNumberOfItems}.`
    );
    inactiveItems.forEach(b => core.info(`- ${b.updatedAtString} - ${b.title}`));
    return [];
  }

  const itemsToKeep = inactiveItems.slice(0, maxNumberOfItems);
  core.info(`\nInactive ${cardType} Cards to Keep based on Max Number of ${maxNumberOfItems} Inactive Items:`);
  if (itemsToKeep && itemsToKeep.length > 0) {
    itemsToKeep.forEach(b => core.info(`- ${b.updatedAtString} - ${b.title}`));
  } else {
    core.info(`- There are no inactive ${cardType} cards to keep`);
  }

  const spliceAt = (inactiveItems.length - maxNumberOfItems) * -1;
  const itemsToRemove = inactiveItems.slice(spliceAt);
  core.info(`\nInactive ${cardType} Cards to Remove based on Max Number of ${maxNumberOfItems} Inactive Items:`);
  if (itemsToRemove && itemsToRemove.length > 0) {
    itemsToRemove.forEach(b => core.info(`- ${b.updatedAtString} - ${b.title}`));
  } else {
    core.info(` - There are no inactive ${cardType} cards to cleanup`);
  }

  return itemsToRemove;
}

function getDisplay(item) {
  if (!item.isCurrentlyDeployedToAnEnv && !item.isAnActiveBranch) {
    core.info(`- ${item.updatedAtString} - ${item.title}`);
    return;
  }
  if (item.isCurrentlyDeployedToAnEnv) {
    core.info(`- ${item.updatedAtString} - ${item.title} (${item.labels.join(', ')})`);
    return;
  }
  if (item.isAnActiveBranch) {
    core.info(`- ${item.updatedAtString} - ${item.title} (active branch)`);
    return;
  }
}

async function processRefType(refType, activeItems, cleanupType, threshold) {
  if (!activeItems || activeItems.length === 0) {
    core.info(`\nThere were no active ${refType} cards to cleanup.`);
    return [];
  }

  core.startGroup(`${refType} Cards`);

  core.info(`\nAll ${refType} Cards ordered by most recently updated:`);
  activeItems.forEach(i => getDisplay(i));
  let currentlyDeployedItems = activeItems.filter(i => i.isCurrentlyDeployedToAnEnv);
  core.info(`\nCurrently Deployed ${refType} Cards that will not be removed:`);
  if (currentlyDeployedItems && currentlyDeployedItems.length > 0) {
    currentlyDeployedItems.forEach(i => getDisplay(i));
  } else {
    core.info(`- There are no currently deployed ${refType} cards`);
  }

  if (refType === 'Branch') {
    let activeBranchItems = activeItems.filter(i => i.isAnActiveBranch);

    core.info(`\nCards with active branches that will not be removed:`);
    if (activeBranchItems && activeBranchItems.length > 0) {
      activeBranchItems.forEach(i => getDisplay(i));
    } else {
      core.info(`- There are no Branch Cards with active branches`);
    }
  }

  switch (cleanupType) {
    case 'number':
      itemsToRemove = await figureOutItemsToRemoveByMaxNumberOfItems(activeItems, threshold, refType);
      break;
    case 'age':
      itemsToRemove = await figureOutItemsToRemoveByMaxAgeOfItems(activeItems, threshold, refType);
      break;
  }

  core.endGroup();
  return itemsToRemove;
}

async function run() {
  activeBoardItems = await getAllActiveItemsOnTheBoard();

  const closedBranchesToRemove = await processRefType('Branch', activeBranches, branchCleanupStrategy, branchThreshold);
  const tagsToRemove = await processRefType('Tag', activeTags, tagCleanupStrategy, tagThreshold);
  const shasToRemove = await processRefType('SHA', activeShas, shaCleanupStrategy, shaThreshold);

  for (let index = 0; index < closedBranchesToRemove.length; index++) {
    const item = closedBranchesToRemove[index];
    await closeAndArchiveItem(item.title, item.number, item.projectCardId);
  }
  for (let index = 0; index < tagsToRemove.length; index++) {
    const item = tagsToRemove[index];
    await closeAndArchiveItem(item.title, item.number, item.projectCardId);
  }
  for (let index = 0; index < shasToRemove.length; index++) {
    const item = shasToRemove[index];
    await closeAndArchiveItem(item.title, item.number, item.projectCardId);
  }
}

try {
  run();
} catch (error) {
  core.setFailed(`An error occurred cleaning up the deployment board.`);
}
