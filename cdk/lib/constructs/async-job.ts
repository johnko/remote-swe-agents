import { Construct } from 'constructs';
import { CfnOutput, Duration, TimeZone } from 'aws-cdk-lib';
import { Architecture, DockerImageFunction, IFunction } from 'aws-cdk-lib/aws-lambda';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { join } from 'path';
import { Schedule, ScheduleExpression, ScheduleTargetInput } from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke } from 'aws-cdk-lib/aws-scheduler-targets';
import { Storage } from './storage';
import { readFileSync } from 'fs';
import { ContainerImageBuild } from '@cdklabs/deploy-time-build';
import { WorkerBus } from './worker/bus';

export interface AsyncJobProps {
  readonly storage: Storage;
  readonly workerBus: WorkerBus;
}

export class AsyncJob extends Construct {
  readonly handler: IFunction;

  constructor(scope: Construct, id: string, props: AsyncJobProps) {
    super(scope, id);
    const { storage, workerBus } = props;

    const image = new ContainerImageBuild(this, 'Image', {
      directory: '..',
      file: join('docker', 'job.Dockerfile'),
      exclude: readFileSync('.dockerignore').toString().split('\n'),
      platform: Platform.LINUX_ARM64,
    });

    const handler = new DockerImageFunction(this, 'Handler', {
      // Lambda ESM handler: points to the named 'handler' export in async-job-runner.mjs
      // The build produces ESM modules with named exports, so we reference as module.export
      code: image.toLambdaDockerImageCode({ cmd: ['async-job-runner.handler'] }),
      memorySize: 256,
      timeout: Duration.minutes(10),
      architecture: Architecture.ARM_64,
      environment: {
        TABLE_NAME: storage.table.tableName,
        EVENT_HTTP_ENDPOINT: workerBus.httpEndpoint,
      },
    });

    storage.table.grantReadWriteData(handler);
    // Allow the async job to publish webapp realtime events (e.g. session
    // deletion progress) over the AppSync Events API.
    workerBus.api.grantPublish(handler);

    handler.addToRolePolicy(
      new PolicyStatement({
        actions: [
          'comprehend:DetectDominantLanguage',
          'translate:TranslateText',
        ],
        resources: ['*'],
      })
    );

    new CfnOutput(this, 'HandlerArn', { value: handler.functionArn });
    this.handler = handler;

    // you can add scheduled jobs here.
    this.addSchedule(
      'SampleJob',
      ScheduleExpression.cron({ minute: '0', hour: '0', day: '1', timeZone: TimeZone.ETC_UTC })
    );
  }

  public addSchedule(jobType: string, schedule: ScheduleExpression, payload?: any) {
    return new Schedule(this, jobType, {
      schedule,
      target: new LambdaInvoke(this.handler, {
        input: ScheduleTargetInput.fromObject({ jobType, payload }),
        retryAttempts: 1,
      }),
    });
  }
}
