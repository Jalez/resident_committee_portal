-- Migration: Rename treasury subroute RBAC permissions
-- Changes:
--   treasury_breakdown:read -> treasury:breakdown:read
--   transactions:* -> treasury:transactions:*
--   reimbursements:* -> treasury:reimbursements:*
--   budgets:* -> treasury:budgets:*

UPDATE roles
SET permissions = (
  SELECT array_agg(
    CASE 
      WHEN perm = 'treasury_breakdown:read' THEN 'treasury:breakdown:read'
      WHEN perm = 'transactions:read' THEN 'treasury:transactions:read'
      WHEN perm = 'transactions:write' THEN 'treasury:transactions:write'
      WHEN perm = 'transactions:update' THEN 'treasury:transactions:update'
      WHEN perm = 'transactions:delete' THEN 'treasury:transactions:delete'
      WHEN perm = 'transactions:update-self' THEN 'treasury:transactions:update-self'
      WHEN perm = 'transactions:delete-self' THEN 'treasury:transactions:delete-self'
      WHEN perm = 'reimbursements:read' THEN 'treasury:reimbursements:read'
      WHEN perm = 'reimbursements:write' THEN 'treasury:reimbursements:write'
      WHEN perm = 'reimbursements:update' THEN 'treasury:reimbursements:update'
      WHEN perm = 'reimbursements:delete' THEN 'treasury:reimbursements:delete'
      WHEN perm = 'reimbursements:update-self' THEN 'treasury:reimbursements:update-self'
      WHEN perm = 'reimbursements:delete-self' THEN 'treasury:reimbursements:delete-self'
      WHEN perm = 'budgets:read' THEN 'treasury:budgets:read'
      WHEN perm = 'budgets:write' THEN 'treasury:budgets:write'
      WHEN perm = 'budgets:update' THEN 'treasury:budgets:update'
      WHEN perm = 'budgets:delete' THEN 'treasury:budgets:delete'
      WHEN perm = 'budgets:update-self' THEN 'treasury:budgets:update-self'
      WHEN perm = 'budgets:delete-self' THEN 'treasury:budgets:delete-self'
      ELSE perm
    END
  )
  FROM unnest(permissions) AS perm
)
WHERE permissions && ARRAY[
  'treasury_breakdown:read',
  'transactions:read', 'transactions:write', 'transactions:update', 'transactions:delete',
  'transactions:update-self', 'transactions:delete-self',
  'reimbursements:read', 'reimbursements:write', 'reimbursements:update', 'reimbursements:delete',
  'reimbursements:update-self', 'reimbursements:delete-self',
  'budgets:read', 'budgets:write', 'budgets:update', 'budgets:delete',
  'budgets:update-self', 'budgets:delete-self'
];
