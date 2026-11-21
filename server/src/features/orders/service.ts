import type { CreateOrderFromProposalInput, CreateOrderFromProposalResult } from '@nless/shared/features/orders/types';
import { confirm } from './confirm';
import { propose } from './propose';
export { getOrderForPayment, getOrderMetrics, lockOrderForPayment, listOrdersByCustomer, registerOrderHook, setPaymentState } from './order-repo';

export async function createOrderFromProposal(input: CreateOrderFromProposalInput): Promise<CreateOrderFromProposalResult> {
  return input.stage === 'propose' ? propose(input) : confirm(input);
}
