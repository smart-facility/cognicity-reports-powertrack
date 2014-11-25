'use strict';

//test-config.js - require sample config and change some properties for test

var config = require("./sample-reports-config.js");

// Change instance name so we log to test.log
config.instance = 'test';

// Export our modified config
module.exports = config;