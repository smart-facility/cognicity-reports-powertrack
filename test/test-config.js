'use strict';

// test-config.js - include the sample config and change some properties for test

var config = require("../sample-reports-config.js");

// Change instance name so we log to test.log
config.logger.filename = 'test';

// Export our modified config
module.exports = config;
