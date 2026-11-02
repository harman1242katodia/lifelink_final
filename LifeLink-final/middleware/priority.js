/**
 * ==============================================================================
 * LifeLink — Hospital Priority System (Deterministic Rule-Based Triage)
 * ==============================================================================
 * 
 * Transparent, deterministic prioritization system based on clinical urgency
 * and elapsed waiting time.
 * NOTE: This is a rule-based triage heuristic, not an artificial intelligence model,
 * and does not automate medical allocation or treatment decisions.
 * ==============================================================================
 */

/**
 * Calculates priority score and triage tier for a patient request.
 * 
 * Rules:
 * 1. Urgency = 'Critical' -> High Priority
 * 2. Urgency = 'High':
 *    - If waiting time > 12 hours -> High Priority (escalated)
 *    - Otherwise -> Medium Priority
 * 3. Urgency = 'Normal':
 *    - If waiting time > 48 hours -> Medium Priority (escalated)
 *    - Otherwise -> Low Priority
 * 
 * @param {string} urgency 'Critical' | 'High' | 'Normal'
 * @param {Date|string} createdAt Timestamp when request was submitted
 * @returns {{ priority: 'High'|'Medium'|'Low', reason: string, hoursWaiting: number }}
 */
function calculateRequestPriority(urgency = 'Normal', createdAt = new Date()) {
  const createdDate = new Date(createdAt);
  const now = new Date();
  const diffMs = Math.max(0, now - createdDate);
  const hoursWaiting = Math.floor(diffMs / (1000 * 60 * 60));

  let priority = 'Medium';
  let reason = '';

  const cleanUrgency = String(urgency).trim();

  if (cleanUrgency.toLowerCase() === 'critical') {
    priority = 'High';
    reason = `Rule 1: Urgency classified as Critical (immediate trauma/surgical window). Waiting: ${hoursWaiting}h.`;
  } else if (cleanUrgency.toLowerCase() === 'high') {
    if (hoursWaiting >= 12) {
      priority = 'High';
      reason = `Rule 2A: High urgency with extended waiting time (>= 12 hours). Escalated to High priority.`;
    } else {
      priority = 'Medium';
      reason = `Rule 2B: High urgency within initial triage window (< 12 hours). Assigned Medium priority.`;
    }
  } else {
    // Normal Urgency
    if (hoursWaiting >= 48) {
      priority = 'Medium';
      reason = `Rule 3A: Standard urgency with extended waiting time (>= 48 hours). Escalated to Medium priority.`;
    } else {
      priority = 'Low';
      reason = `Rule 3B: Standard elective urgency within acceptable window (< 48 hours). Assigned Low priority.`;
    }
  }

  return {
    priority,
    reason,
    hoursWaiting
  };
}

module.exports = {
  calculateRequestPriority
};
