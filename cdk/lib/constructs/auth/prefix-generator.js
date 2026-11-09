const response = require('cfn-response');
const crypto = require('crypto');

exports.handler = async function (event, context) {
  try {
    console.log(event);
    if (event.RequestType == 'Delete') {
      return await response.send(event, context, response.SUCCESS);
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
      return await response.send(event, context, response.SUCCESS, { generated }, generated);
    }
    if (event.RequestType == 'Update') {
      const current = event.PhysicalResourceId;
      if (current.startsWith(prefix)) {
        return await response.send(event, context, response.SUCCESS, { generated: current }, current);
      }
      const generated = generate();
      return await response.send(event, context, response.SUCCESS, { generated }, generated);
    }
  } catch (e) {
    console.log(e);
    await response.send(event, context, response.FAILED);
  }
};
