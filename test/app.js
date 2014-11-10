'use strict';

/* jshint node:true */
/* jshint unused:vars */ // We want to keep function parameters on callbacks like the originals
/* jshint curly:false */ // Don't require curly brackets around one-line statements

/* jshint -W079 */ // Ignore this error for this import only, as we get a redefinition problem
var test = require('unit.js');
/* jshint +W079 */

var fork = require('child_process').fork;

//Test harness for app.js script
describe( 'app.js', function() {
	
	// Can the app launch - and fail with a process.exit(1)
	// This tests much of the code in app.js
	it( 'should launch with default configuration and fail with an error', function(done) {
		// Set timeout high to let node launch the child process. Typically takes 1000ms.
		// If the app takes longer than this, the test will fail, which we want to happen in case it hangs due to a bug.
		this.timeout(10000); 
		
		// Launch 'node app.js sample-reports-config.js'
		var child = fork('app.js',['sample-reports-config.js']);
	  
		// Wait for the child process to exit
		function waitForChild() {
			if (child.exitCode === null) {
				setTimeout( waitForChild, 100);
			} else {
				doTest();
			}
		}
		
		// Once the child has exited, test the exit code and end the async mocha test
		function doTest() {			
			test.value(child.exitCode).is(1);
			done();
		}
		
		// Start waiting for the child process to exit
		waitForChild();
	});

});