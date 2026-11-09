const crypto = require('crypto');

/**
 * Inline bundled cfn-response module
 * Original: https://www.npmjs.com/package/cfn-response
 * License: AWS Customer Agreement
 */
const cfnResponse = {
  SUCCESS: "SUCCESS",
  FAILED: "FAILED",

  send: function(event, context, responseStatus, responseData, physicalResourceId) {
    const responseBody = JSON.stringify({
      Status: responseStatus,
      Reason: "See the details in CloudWatch Log Stream: " + context.logStreamName,
      PhysicalResourceId: physicalResourceId || context.logStreamName,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: responseData
    });

    console.log("Response body:\n", responseBody);

    const https = require("https");
    const url = require("url");

    const parsedUrl = url.parse(event.ResponseURL);
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: "PUT",
      headers: {
        "content-type": "",
        "content-length": responseBody.length
      }
    };

    return new Promise((resolve, reject) => {
      const request = https.request(options, function(response) {
        console.log("Status code: " + response.statusCode);
        console.log("Status message: " + response.statusMessage);
        resolve();
      });

      request.on("error", function(error) {
        console.log("send(..) failed executing https.request(..): " + error);
        reject(error);
      });

      request.write(responseBody);
      request.end();
    });
  }
};

exports.handler = async function (event, context) {
  try {
    console.log(event);
    if (event.RequestType == 'Delete') {
      await cfnResponse.send(event, context, cfnResponse.SUCCESS);
      return;
    }

    const prefix = event.ResourceProperties.prefix ?? '';
    const rawLength = event.ResourceProperties.length ?? '8';

    // Validate length parameter to ensure sufficient randomness
    const length = parseInt(rawLength, 10);
    if (isNaN(length) || length < 8 || length > 128) {
      throw new Error(`Invalid length parameter: ${rawLength}. Must be an integer between 8 and 128.`);
    }

    const generate = () => {
      // Generate at least enough bytes to cover the requested length in hex
      // Each hex character represents 4 bits, so 2 hex chars per byte
      const byteLength = Math.ceil(length / 2);
      const random = crypto.randomBytes(byteLength).toString('hex');
      return `${prefix}${random.slice(0, length)}`;
    };

    if (event.RequestType == 'Create') {
      const generated = generate();
      await cfnResponse.send(event, context, cfnResponse.SUCCESS, { generated }, generated);
      return;
    }
    if (event.RequestType == 'Update') {
      const current = event.PhysicalResourceId;
      if (current.startsWith(prefix)) {
        await cfnResponse.send(event, context, cfnResponse.SUCCESS, { generated: current }, current);
        return;
      }
      const generated = generate();
      await cfnResponse.send(event, context, cfnResponse.SUCCESS, { generated }, generated);
    }
  } catch (e) {
    console.log(e);
    await cfnResponse.send(event, context, cfnResponse.FAILED);
    throw e;
  }
};
