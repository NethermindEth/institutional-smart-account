module.exports = {
  skipFiles: [
    "test/",
    "interfaces/",
    "libraries/",
    "MockEntryPoint.sol",
    "MaliciousReentrancy.sol",
  ],
  configureYulOptimizer: true,
  measureStatementCoverage: true,
  measureFunctionCoverage: true,
  measureBranchCoverage: true,
  measureLineCoverage: true,
  providerOptions: {
    default_balance_ether: "10000",
    total_accounts: 20,
  },
};


