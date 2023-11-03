# cleanup-deployment-board

## DEPRECATION NOTICE

This action works in tandem with [im-open/update-deployment-board].  That action was implemented as a visual way to represent our deployments and we looked forward to GitHub creating a native feature that represented deployments to environments more accurately than just reporting which GitHub environments had been accessed.  The initial work used GitHub Projects which are now considered Classic Projects.  The API this action utilizes is not compatible with the new Issues and Projects so this action and [im-open/update-deployment-board] will be deprecated in the near future.  We haven't found a suitable alternative within GitHub so our focus will be on an external solution at this time.

## Index <!-- omit in toc -->

- [cleanup-deployment-board](#cleanup-deployment-board)
  - [DEPRECATION NOTICE](#deprecation-notice)
  - [Overview](#overview)
  - [Inputs](#inputs)
  - [Usage Examples](#usage-examples)
  - [Contributing](#contributing)
    - [Incrementing the Version](#incrementing-the-version)
    - [Source Code Changes](#source-code-changes)
    - [Recompiling Manually](#recompiling-manually)
    - [Updating the README.md](#updating-the-readmemd)
  - [Code of Conduct](#code-of-conduct)
  - [License](#license)

## Overview

This action will clean up inactive cards on an Automated Deployment Project Board.  It is intended to be used in conjunction with the [update-deployment-board] action which is what creates the cards to begin with.  

When this action is run, it will pull all of the cards from the Automated Deployment Project board that were created by the [update-deployment-board] action.  It will examine the set of branch, tag and sha cards independently to determine what can be removed.  For each different set (branch/tag/sha) it will:

- Remove cards that are currently deployed to an environment from the list of potential cards to remove
- Remove Branch Deploy cards that have an active branch associated with them from the list of potential cards to remove
- Order the remaining cards by modified date
- Apply the respective strategy to determine which remaining cards to keep and which to remove

For the Branch Deploy cards, the action will not delete cards that have active branches. To keep this action working optimally, delete closed branches after a PR is merged.  This can be done automatically by going to the Repository's Settings/Options page and checking the box for `Automatically delete head branches`.

## Inputs

| Parameter                 | Is Required | Description                                                                                                                                                                                                                        |
|---------------------------|-------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `github-token`            | true        | A token with permissions to create and update issues.                                                                                                                                                                              |
| `github-login`            | false       | The login associated with the account that created the deployment cards.  Defaults to github-actions.                                                                                                                              |
| `branch-cleanup-strategy` | true        | The cleanup strategy for Branch Deployment cards.  Accepted Values: *<age,number>*                                                                                                                                                 |
| `branch-threshold`        | true        | The Max Age in Days or the Max Number of Items to keep, depending on the branch-cleanup-strategy.                                                                                                                                  |
| `tag-cleanup-strategy`    | true        | The cleanup strategy for Tag Deployment cards.  Accepted Values: *<age,number>*                                                                                                                                                    |
| `tag-threshold`           | true        | The Max Age in Days or the Max Number of Items to keep, depending on the tag-cleanup-strategy.                                                                                                                                     |
| `sha-cleanup-strategy`    | true        | The cleanup strategy for SHA Deployment cards.  Accepted Values: *<age,number>*                                                                                                                                                    |
| `sha-threshold`           | true        | The Max Age in Days or the Max Number of Items to keep, depending on the sha-cleanup-strategy.                                                                                                                                     |
| `board-number`            | true        | The number of the project board that will be updated.  Can be found by using the number in the board's url. <br/><br/> For example the number would be 1 for:<br/><https://github.com/im-open/update-deployment-board/projects/1>. |

## Usage Examples

```yml
name: Cleanup Automated Deployment Board
on:
  schedule:
    - cron: '30 6 * * 7'  # Run every Sunday at 06:30
  workflow_dispatch:
      
jobs:
  cleanup-board:
    runs-on: [ubuntu-20.04]
    steps:
      - uses: actions/checkout@v3

      - name: Cleanup
        # You may also reference just the major or major.minor version
        uses: im-open/cleanup-deployment-board@v1.1.6
        with:
          github-token: ${{ secrets.BOT_TOKEN}} 
          github-login: 'my-bot'  # The login that created the deployment cards to begin with.  Defaults to github-actions.
          board-number: 1
          
          # Keep the 5 most recent branch deploy cards in addition to any cards
          # with active branches or that are currently deployed
          branch-cleanup-strategy: 'number' 
          branch-threshold: '5'         
          
          # Keep any tag deploy cards that are less than 5 days old
          # in addition to any cards that are currently deployed
          tag-cleanup-strategy: 'age'    
          tag-threshold: '5'         
          
          # Don't keep any SHA deploy cards except those that might 
          # be currently deployed to an environment.
          sha-cleanup-strategy: 'number' 
          sha-threshold: '0'         
```

## Contributing

When creating PRs, please review the following guidelines:

- [ ] The action code does not contain sensitive information.
- [ ] At least one of the commit messages contains the appropriate `+semver:` keywords listed under [Incrementing the Version] for major and minor increments.
- [ ] The action has been recompiled.  See [Recompiling Manually] for details.
- [ ] The README.md has been updated with the latest version of the action.  See [Updating the README.md] for details.

### Incrementing the Version

This repo uses [git-version-lite] in its workflows to examine commit messages to determine whether to perform a major, minor or patch increment on merge if [source code] changes have been made.  The following table provides the fragment that should be included in a commit message to active different increment strategies.

| Increment Type | Commit Message Fragment                     |
|----------------|---------------------------------------------|
| major          | +semver:breaking                            |
| major          | +semver:major                               |
| minor          | +semver:feature                             |
| minor          | +semver:minor                               |
| patch          | *default increment type, no comment needed* |

### Source Code Changes

The files and directories that are considered source code are listed in the `files-with-code` and `dirs-with-code` arguments in both the [build-and-review-pr] and [increment-version-on-merge] workflows.  

If a PR contains source code changes, the README.md should be updated with the latest action version and the action should be recompiled.  The [build-and-review-pr] workflow will ensure these steps are performed when they are required.  The workflow will provide instructions for completing these steps if the PR Author does not initially complete them.

If a PR consists solely of non-source code changes like changes to the `README.md` or workflows under `./.github/workflows`, version updates and recompiles do not need to be performed.

### Recompiling Manually

This command utilizes [esbuild] to bundle the action and its dependencies into a single file located in the `dist` folder.  If changes are made to the action's [source code], the action must be recompiled by running the following command:

```sh
# Installs dependencies and bundles the code
npm run build
```

### Updating the README.md

If changes are made to the action's [source code], the [usage examples] section of this file should be updated with the next version of the action.  Each instance of this action should be updated.  This helps users know what the latest tag is without having to navigate to the Tags page of the repository.  See [Incrementing the Version] for details on how to determine what the next version will be or consult the first workflow run for the PR which will also calculate the next version.

## Code of Conduct

This project has adopted the [im-open's Code of Conduct](https://github.com/im-open/.github/blob/main/CODE_OF_CONDUCT.md).

## License

Copyright &copy; 2023, Extend Health, LLC. Code released under the [MIT license](LICENSE).

<!-- Links -->
[Incrementing the Version]: #incrementing-the-version
[Recompiling Manually]: #recompiling-manually
[Updating the README.md]: #updating-the-readmemd
[source code]: #source-code-changes
[usage examples]: #usage-examples
[build-and-review-pr]: ./.github/workflows/build-and-review-pr.yml
[increment-version-on-merge]: ./.github/workflows/increment-version-on-merge.yml
[esbuild]: https://esbuild.github.io/getting-started/#bundling-for-node
[git-version-lite]: https://github.com/im-open/git-version-lite
[update-deployment-board]: https://github.com/im-open/update-deployment-board
[im-open/update-deployment-board]: https://github.com/im-open/update-deployment-board
