'use strict';

const Promise = require('bluebird');
const AWS = require('aws-sdk');
const _ = require('lodash');
const { createJobValidator, createAction } = require('lard-codepipeline-custom-action');

AWS.config.setPromisesDependency(Promise);

const lambda = new AWS.Lambda();

const jobValidator = createJobValidator(1, 0, (job) => {
	job.aliasName = _.get(job, 'data.actionConfiguration.configuration.UserParameters');

	if (!job.aliasName) {
		throw new Error('Alias name must be specified via CodePipeline custom action user parameters');
	}

	return job;
});

const inputHandler = (job, input) => {
	console.log(`Received input:\n${JSON.stringify(input, null, 2)}`);

	const updates = input.map((version) => {
		const params = {
			FunctionName: version.FunctionName,
			Name: job.aliasName,
			FunctionVersion: version.Version,
		};

		console.log(`Updating alias:\n${JSON.stringify(params, null, 2)}`);

		return lambda.updateAlias(params)
			.promise()
			.then((data) => {
				console.log(`Updated alias ${data.AliasArn}`);
			})
			.catch((error) => {
				if (error.code !== 'ResourceNotFoundException') {
					console.error(`Failed to update ${params.Name} alias for ${params.FunctionName}: ${error}`);
					throw error;
				}

				console.log(`The ${params.Name} alias for ${params.FunctionName} does not exist; creating`);

				return lambda.createAlias(params)
					.promise()
					.then((data) => {
						console.log(`Created alias ${data.AliasArn}`);
					})
					.catch((secondError) => {
						console.error(`Failed to create ${params.Name} alias for ${params.FunctionName}: ${secondError}`);
						throw secondError;
					});
			});
	});

	return Promise.all(updates)
		.then(() => [job]);
};

module.exports = createAction({
	jobValidator,
	inputHandler,
});
