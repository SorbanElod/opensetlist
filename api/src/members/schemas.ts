import { z } from 'zod';

// Only the role can be changed through the API; everything else about a
// membership is managed by the registration bootstrap or removed by the
// group_manager through DELETE.
export const changeRoleSchema = z.object({
  role: z.enum(['reader', 'member', 'group_manager']),
});
