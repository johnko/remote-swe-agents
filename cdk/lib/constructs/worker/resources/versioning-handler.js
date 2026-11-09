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
    const initialVersion = event.ResourceProperties.initialVersion;
    if (event.RequestType == 'Create') {
      await cfnResponse.send(event, context, cfnResponse.SUCCESS, { version: initialVersion }, initialVersion);
      return;
    }
    if (event.RequestType == 'Update') {
      const currentVersion = event.PhysicalResourceId; // e.g. 1.0.0
      // increment patch version
      const [major, minor, patch] = currentVersion.split('.').map(Number);
      const [oMajor, oMinor, oPatch] = initialVersion.split('.').map(Number);
      let newVersion = [major, minor, patch + 1].join('.');
      if (oMajor > major || (oMajor == major && oMinor > minor)) {
        newVersion = initialVersion;
      }
      await cfnResponse.send(event, context, cfnResponse.SUCCESS, { version: newVersion }, newVersion);
    }
  } catch (e) {
    console.log(e);
    await cfnResponse.send(event, context, cfnResponse.FAILED);
    throw e;
  }
};
