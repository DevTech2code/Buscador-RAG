import { ConversationScopePolicyService } from './conversation-scope-policy.service';
import { EvidencePolicyService } from './evidence-policy.service';
import { PolicyViolationError } from './domain/policy-violation.error';
import { ResponseFormatPolicyService } from './response-format-policy.service';

describe('Guardrail policies', () => {
  it('rejects conversations outside the sales domain', () => {
    const decision = new ConversationScopePolicyService().evaluate(
      'out_of_scope',
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reorientationMessage).toContain('productos del catálogo');
  });

  it('allows supported sales intents', () => {
    const policy = new ConversationScopePolicyService();

    expect(policy.evaluate('technical_specs').allowed).toBe(true);
    expect(policy.evaluate('stock_check').allowed).toBe(true);
  });

  it('requires technical claims to include ERP or datasheet evidence', () => {
    const policy = new EvidencePolicyService();

    expect(
      policy.approve([
        {
          attribute: 'Protection',
          value: 'IP67',
          source: 'datasheet',
          reference: 'datasheet.pdf#page=2',
        },
      ]),
    ).toHaveLength(1);
    expect(() =>
      policy.approve([
        {
          attribute: 'Protection',
          value: 'IP67',
          source: 'datasheet',
          reference: '',
        },
      ]),
    ).toThrow(PolicyViolationError);
  });

  it('rejects code blocks and raw JSON in advisor responses', () => {
    const policy = new ResponseFormatPolicyService();

    expect(() =>
      policy.assertAdvisorSafeText('**Disponible:** 10 unidades'),
    ).not.toThrow();
    expect(() => policy.assertAdvisorSafeText('```json\n{}\n```')).toThrow(
      PolicyViolationError,
    );
    expect(() => policy.assertAdvisorSafeText('{"stock":10}')).toThrow(
      PolicyViolationError,
    );
  });
});
