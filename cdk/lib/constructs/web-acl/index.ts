import { CfnIPSet, CfnWebACL, CfnWebACLProps } from 'aws-cdk-lib/aws-wafv2';
import { Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface CommonWebAclProps {
  scope: 'REGIONAL' | 'CLOUDFRONT';
  allowedIpV4AddressRanges?: string[] | null;
  allowedIpV6AddressRanges?: string[] | null;
  allowedCountryCodes?: string[] | null;
  /**
   * Rate limiting configuration
   * @default 1000 requests per 5 minutes per IP
   */
  rateLimit?: number;
  /**
   * Exclude allowed IPv4 address ranges from rate limiting
   * @default false
   */
  excludeAllowedIpsFromRateLimit?: boolean;
}

export class CommonWebAcl extends Construct {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: CommonWebAclProps) {
    super(scope, id);

    const rules: CfnWebACLProps['rules'] = [];

    const commonRuleProperties = (
      name: string
    ): Pick<CfnWebACL.RuleProperty, 'name' | 'action' | 'visibilityConfig'> => ({
      name,
      action: { allow: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: name,
      },
    });

    const generateIpSetRule = (priority: number, name: string, ipSetArn: string): CfnWebACL.RuleProperty => ({
      priority,
      ...commonRuleProperties(name),
      statement: {
        ipSetReferenceStatement: {
          arn: ipSetArn,
        },
      },
    });

    const generateIpSetAndGeoMatchRule = (
      priority: number,
      name: string,
      ipSetArn: string,
      allowedCountryCodes: string[]
    ): CfnWebACL.RuleProperty => ({
      priority,
      ...commonRuleProperties(name),
      statement: {
        // Specifying AND condition
        andStatement: {
          statements: [
            {
              ipSetReferenceStatement: {
                arn: ipSetArn,
              },
            },
            {
              geoMatchStatement: {
                countryCodes: allowedCountryCodes,
              },
            },
          ],
        },
      },
    });

    const hasAllowedIpV4 = props.allowedIpV4AddressRanges && props.allowedIpV4AddressRanges.length > 0;
    const hasAllowedIpV6 = props.allowedIpV6AddressRanges && props.allowedIpV6AddressRanges.length > 0;
    const hasAllowedCountryCodes = props.allowedCountryCodes && props.allowedCountryCodes.length > 0;

    // Track IPv4 IPSet ARN for potential use in rate limit exclusion
    let wafIPv4SetArn: string | undefined;

    // Define rules for IP v4 and v6 separately
    if (hasAllowedIpV4) {
      const wafIPv4Set = new CfnIPSet(this, 'IPv4Set', {
        ipAddressVersion: 'IPV4',
        scope: props.scope,
        addresses: props.allowedIpV4AddressRanges ?? [],
      });
      wafIPv4SetArn = wafIPv4Set.attrArn;
      if (hasAllowedCountryCodes) {
        // For geo restrictions, create AND condition with IP restriction
        rules.push(
          generateIpSetAndGeoMatchRule(1, 'IpV4SetAndGeoMatchRule', wafIPv4Set.attrArn, props.allowedCountryCodes ?? [])
        );
      } else {
        rules.push(generateIpSetRule(1, 'IpV4SetRule', wafIPv4Set.attrArn));
      }
    }

    if (hasAllowedIpV6) {
      const wafIPv6Set = new CfnIPSet(this, 'IPv6Set', {
        ipAddressVersion: 'IPV6',
        scope: props.scope,
        addresses: props.allowedIpV6AddressRanges ?? [],
      });
      if (hasAllowedCountryCodes) {
        // For geo restrictions, create AND condition with IP restriction
        rules.push(
          generateIpSetAndGeoMatchRule(2, 'IpV6SetAndGeoMatchRule', wafIPv6Set.attrArn, props.allowedCountryCodes ?? [])
        );
      } else {
        rules.push(generateIpSetRule(2, 'IpV6SetRule', wafIPv6Set.attrArn));
      }
    }

    // For geo restrictions only without IP restrictions
    if (!hasAllowedIpV4 && !hasAllowedIpV6 && hasAllowedCountryCodes) {
      rules.push({
        priority: 3,
        ...commonRuleProperties('GeoMatchRule'),
        statement: {
          geoMatchStatement: {
            countryCodes: props.allowedCountryCodes ?? [],
          },
        },
      });
    }

    // SECURITY FIX: Add rate-based rule to protect against DDoS and brute force
    // Priority 0 must come before IP/geo rules
    const rateLimit = props.rateLimit ?? 1000;
    const excludeAllowedIpsFromRateLimit = props.excludeAllowedIpsFromRateLimit ?? false;

    const rateBasedStatement: CfnWebACL.RateBasedStatementProperty = {
      limit: rateLimit,
      evaluationWindowSec: 300, // 5 minute window
      aggregateKeyType: 'IP',
    };

    // If enabled and IPv4 IPSet exists, exclude allowed IPs from rate limiting
    if (excludeAllowedIpsFromRateLimit && wafIPv4SetArn) {
      (rateBasedStatement as any).scopeDownStatement = {
        notStatement: {
          statement: {
            ipSetReferenceStatement: {
              arn: wafIPv4SetArn,
            },
          },
        },
      };
    }

    rules.unshift({
      priority: 0,
      name: 'RateLimitRule',
      statement: {
        rateBasedStatement,
      },
      action: { block: {} },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'RateLimitRule',
      },
    });

    const webAcl = new CfnWebACL(this, 'WebAcl', {
      defaultAction: { block: {} },
      scope: props.scope,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        sampledRequestsEnabled: true,
        metricName: `RemoteSweWebAcl-${this.node.addr}`,
      },
      rules: rules,
    });
    this.webAclArn = webAcl.attrArn;
  }
}
