import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatch_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

/**
 * CloudWatch Alarm Stack Props
 */
export interface CloudWatchAlarmStackProps extends cdk.StackProps {
  createItemFunction: lambda.IFunction;
  getItemFunction: lambda.IFunction;
  listItemsFunction: lambda.IFunction;
  updateItemFunction: lambda.IFunction;
  createVersionFunction: lambda.IFunction;
  alarmTopic: sns.ITopic;
  environment?: string;
}

/**
 * CloudWatch Alarm Stack
 * 
 * Creates CloudWatch alarms for Lambda functions:
 * - Duration alarm (threshold: 70% of timeout)
 * - Memory usage alarm (threshold: 70% of allocated memory)
 * - Error alarm (shortest period possible)
 * 
 * Alarms are only created in production environment.
 */
export class CloudWatchAlarmStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CloudWatchAlarmStackProps) {
    super(scope, id, props);

    const {
      createItemFunction,
      getItemFunction,
      listItemsFunction,
      updateItemFunction,
      createVersionFunction,
      alarmTopic,
      environment = 'dev',
    } = props;

    // Only create alarms in production
    if (environment !== 'prod' && environment !== 'production') {
      return;
    }

    const functions = [
      { name: 'CreateItem', function: createItemFunction, timeout: 30, memory: 256 },
      { name: 'GetItem', function: getItemFunction, timeout: 30, memory: 256 },
      { name: 'ListItems', function: listItemsFunction, timeout: 30, memory: 512 },
      { name: 'UpdateItem', function: updateItemFunction, timeout: 30, memory: 512 },
      { name: 'CreateVersion', function: createVersionFunction, timeout: 30, memory: 512 },
    ];

    functions.forEach(({ name, function: lambdaFunction, timeout, memory }) => {
      // Duration Alarm - 70% of timeout
      const durationThreshold = timeout * 0.7; // 70% of timeout in seconds
      const durationAlarm = new cloudwatch.Alarm(this, `${name}DurationAlarm`, {
        alarmName: `item-challenge-${name.toLowerCase()}-duration`,
        alarmDescription: `Alert when ${name} Lambda duration exceeds 70% of timeout`,
        metric: lambdaFunction.metricDuration({
          statistic: 'Average',
          period: cdk.Duration.minutes(1),
        }),
        threshold: durationThreshold * 1000, // Convert to milliseconds
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      durationAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

      // Memory Usage Alarm - 70% of allocated memory
      // Lambda memory utilization is a percentage (0-100), so threshold is 70
      const memoryAlarm = new cloudwatch.Alarm(this, `${name}MemoryAlarm`, {
        alarmName: `item-challenge-${name.toLowerCase()}-memory`,
        alarmDescription: `Alert when ${name} Lambda memory usage exceeds 70% of allocated memory`,
        metric: new cloudwatch.Metric({
          namespace: 'AWS/Lambda',
          metricName: 'MemoryUtilization',
          dimensionsMap: {
            FunctionName: lambdaFunction.functionName,
          },
          statistic: 'Average',
          period: cdk.Duration.minutes(1),
        }),
        threshold: 70, // 70% utilization
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      memoryAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));

      // Error Alarm - shortest period possible (1 minute)
      const errorAlarm = new cloudwatch.Alarm(this, `${name}ErrorAlarm`, {
        alarmName: `item-challenge-${name.toLowerCase()}-errors`,
        alarmDescription: `Alert when ${name} Lambda has errors`,
        metric: lambdaFunction.metricErrors({
          statistic: 'Sum',
          period: cdk.Duration.minutes(1), // Shortest period
        }),
        threshold: 1, // Alert on any error
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      errorAlarm.addAlarmAction(new cloudwatch_actions.SnsAction(alarmTopic));
    });
  }
}

