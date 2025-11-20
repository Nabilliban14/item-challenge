import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

/**
 * SNS Topic Stack Props
 */
export interface SNSTopicStackProps extends cdk.StackProps {
  emailAddress: string;
}

/**
 * SNS Topic Stack
 * 
 * Creates an SNS topic for CloudWatch alarm notifications.
 * Subscribes an email address to receive notifications.
 */
export class SNSTopicStack extends cdk.Stack {
  public readonly alarmTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: SNSTopicStackProps) {
    super(scope, id, props);

    const { emailAddress } = props;

    // Create SNS topic for CloudWatch alarms
    this.alarmTopic = new sns.Topic(this, 'CloudWatchAlarmTopic', {
      topicName: 'item-challenge-cloudwatch-alarms',
      displayName: 'Item Challenge CloudWatch Alarms',
    });

    // Subscribe email address to the topic
    this.alarmTopic.addSubscription(
      new subscriptions.EmailSubscription(emailAddress)
    );

    // Output the topic ARN
    new cdk.CfnOutput(this, 'AlarmTopicArn', {
      value: this.alarmTopic.topicArn,
      description: 'SNS topic ARN for CloudWatch alarm notifications',
      exportName: 'ItemChallengeAlarmTopicArn',
    });
  }
}

