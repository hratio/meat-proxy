const parserOpts = {
  headerPattern: /^(\w*)(?:\((.*)\))?!?: (.*)$/,
  breakingHeaderPattern: /^(\w*)(?:\((.*)\))?!: (.*)$/,
  noteKeywords: ['BREAKING CHANGE', 'BREAKING CHANGES']
};

export default {
  branches: ['main'],
  repositoryUrl: 'https://github.com/hratio/meat-proxy.git',
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { parserOpts }],
    ['@semantic-release/release-notes-generator', { parserOpts }],
    './dev/tooling/release/stage.mjs',
    ['@semantic-release/github', {
      draftRelease: true,
      successCommentCondition: false,
      failCommentCondition: false,
      releasedLabels: false,
      addReleases: false,
      assets: ['tmp/release/*.tgz', 'tmp/release/SHA256SUMS', 'tmp/release/staging.json'],
      releaseBodyTemplate: 'Staged on npm; maintainer approval is required before this version is installable.\n\n<%= nextRelease.notes %>'
    }]
  ]
};
