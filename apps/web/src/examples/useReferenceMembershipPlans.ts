import { useQuery } from '@tanstack/react-query';
import { fetchReferenceMembershipPlans } from './reference-membership-plans';

export function useReferenceMembershipPlans() {
  return useQuery({
    queryKey: ['reference', 'membership-plans'],
    queryFn: fetchReferenceMembershipPlans,
  });
}
