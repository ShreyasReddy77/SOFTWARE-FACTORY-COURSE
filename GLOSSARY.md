# Cadence

A course platform where learners buy courses and can ask for their money back shortly after purchase.

## Language

### Refund Requests

**Refund Request**:
A learner's ask, made within the refund window and with a reason, to get their money back for a Purchase. A person reviews each one by hand.
_Avoid_: Chargeback, Reversal, Cancellation, Cancel my purchase (button label only)

**Pending**:
The state of a Refund Request that has been submitted and is awaiting review by us.
_Avoid_: Requested, Open, Waiting on us

**Approved**:
The state of a Refund Request that review accepted. The learner's access to the course ends at this point, and a Refund is created.
_Avoid_: Accepted, Processed

**Declined**:
The state of a Refund Request that review rejected: nothing is refunded and the Purchase stands.
_Avoid_: Rejected, Denied

### Refunds

**Refund**:
The movement of money back to the learner, which exists only once a Refund Request is Approved.
_Avoid_: Reversal, Chargeback, Payout

**Refund Amount**:
The money a Refund returns, equal to what the learner actually paid. It can be lower than the course's list price when a PPP discount applied.
_Avoid_: Refundable amount, Reversal amount

**Pending Refund**:
The state of a Refund whose money has not yet been sent back to the learner.
_Avoid_: Processing, In progress

**Issued Refund**:
The state of a Refund whose money has been returned to the learner.
_Avoid_: Refunded, Completed, Paid out

**Failed Refund**:
The state of a Refund whose money could not be returned to the learner. It is an unresolved problem for us to fix, and the learner's access stays ended.
_Avoid_: Rejected, Declined, Errored
