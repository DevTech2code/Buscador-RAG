import { Module } from '@nestjs/common';
import { CatalogStockPolicyService } from './catalog-stock-policy.service';
import { ConversationScopePolicyService } from './conversation-scope-policy.service';
import { EvidencePolicyService } from './evidence-policy.service';
import { ResponseFormatPolicyService } from './response-format-policy.service';

@Module({
  providers: [
    CatalogStockPolicyService,
    ConversationScopePolicyService,
    EvidencePolicyService,
    ResponseFormatPolicyService,
  ],
  exports: [
    CatalogStockPolicyService,
    ConversationScopePolicyService,
    EvidencePolicyService,
    ResponseFormatPolicyService,
  ],
})
export class GuardrailsModule {}
