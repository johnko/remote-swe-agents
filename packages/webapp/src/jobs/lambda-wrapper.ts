// Wrapper to make the handler compatible with Lambda's runtime
import { handler } from './async-job-runner.js';

export { handler };
export default handler;
