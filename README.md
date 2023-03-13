# cleanup-deployment-board
    
## Index 

- [Overview](#overview)
- [Inputs](#inputs)
- [Example](#example)
- [Contributing](#contributing)
  - [Recompiling](#recompiling)
  - [Incrementing the Version](#incrementing-the-version)
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

| Parameter                 | Is Required | Description                                                                                                                                                                                                                      |
| ------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github-token`            | true        | A token with permissions to create and update issues.                                                                                                                                                                            |
| `github-login`            | false       | The login associated with the account that created the deployment cards.  Defaults to github-actions.                                                                                                                            |
| `branch-cleanup-strategy` | true        | The cleanup strategy for Branch Deployment cards.  Accepted Values: *<age,number>*                                                                                                                                               |
| `branch-threshold`        | true        | The Max Age in Days or the Max Number of Items to keep, depending on the branch-cleanup-strategy.                                                                                                                                |
| `tag-cleanup-strategy`    | true        | The cleanup strategy for Tag Deployment cards.  Accepted Values: *<age,number>*                                                                                                                                                  |
| `tag-threshold`           | true        | The Max Age in Days or the Max Number of Items to keep, depending on the tag-cleanup-strategy.                                                                                                                                   |
| `sha-cleanup-strategy`    | true        | The cleanup strategy for SHA Deployment cards.  Accepted Values: *<age,number>*                                                                                                                                                  |
| `sha-threshold`           | true        | The Max Age in Days or the Max Number of Items to keep, depending on the sha-cleanup-strategy.                                                                                                                                   |
| `board-number`            | true        | The number of the project board that will be updated.  Can be found by using the number in the board's url. <br/><br/> For example the number would be 1 for:<br/>https://github.com/im-open/update-deployment-board/projects/1. |


## Example

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
        uses: im-open/cleanup-deployment-board@v1.1.5
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

When creating new PRs please ensure:

1. For major or minor changes, at least one of the commit messages contains the appropriate `+semver:` keywords listed under [Incrementing the Version](#incrementing-the-version).
1. The action code does not contain sensitive information.

When a pull request is created and there are changes to code-specific files and folders, the build workflow will run and it will recompile the action and push a commit to the branch if the PR author has not done so. The usage examples in the README.md will also be updated with the next version if they have not been updated manually. The following files and folders contain action code and will trigger the automatic updates:

- action.yml
- package.json
- package-lock.json
- src/\*\*
- dist/\*\*

There may be some instances where the bot does not have permission to push changes back to the branch though so these steps should be done manually for those branches. See [Recompiling Manually](#recompiling-manually) and [Incrementing the Version](#incrementing-the-version) for more details.

### Recompiling Manually

If changes are made to the action's code in this repository, or its dependencies, the action can be re-compiled by running the following command:

```sh
# Installs dependencies and bundles the code
npm run build

# Bundle the code (if dependencies are already installed)
npm run bundle
```

These commands utilize [esbuild](https://esbuild.github.io/getting-started/#bundling-for-node) to bundle the action and
its dependencies into a single file located in the `dist` folder.

### Incrementing the Version

Both the build and PR merge workflows will use the strategies below to determine what the next version will be.  If the build workflow was not able to automatically update the README.md action examples with the next version, the README.md should be updated manually as part of the PR using that calculated version.

This action uses [git-version-lite] to examine commit messages to determine whether to perform a major, minor or patch increment on merge.  The following table provides the fragment that should be included in a commit message to active different increment strategies.
| Increment Type | Commit Message Fragment                     |
| -------------- | ------------------------------------------- |
| major          | +semver:breaking                            |
| major          | +semver:major                               |
| minor          | +semver:feature                             |
| minor          | +semver:minor                               |
| patch          | *default increment type, no comment needed* |

## Code of Conduct

This project has adopted the [im-open's Code of Conduct](https://github.com/im-open/.github/blob/master/CODE_OF_CONDUCT.md).

## License

Copyright &copy; 2021, Extend Health, LLC. Code released under the [MIT license](LICENSE).

[git-version-lite]: https://github.com/im-open/git-version-lite
[update-deployment-board]: https://github.com/im-open/update-deployment-board
