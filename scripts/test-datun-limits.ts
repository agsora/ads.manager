import assert from "node:assert/strict";
import { CAR_LOAN_RANGE, MOTOR_LOAN_RANGE, carMaxLoan, motorMaxLoan, limitDatunLoan } from "../src/lib/datun";

for (const mode of ["mobil", "motor"] as const) {
  const range = mode === "mobil" ? CAR_LOAN_RANGE : MOTOR_LOAN_RANGE;
  const maxFor = mode === "mobil" ? carMaxLoan : motorMaxLoan;
  const maximum = maxFor(range[1], 0.8)!;
  assert.ok(maximum >= range[0]);
  assert.equal(limitDatunLoan(maximum, maximum, mode), maximum, "Automatic maximum stays unchanged");
  assert.equal(limitDatunLoan(maximum * 100, maximum, mode), maximum, "Typed or pasted excess is capped");
  const lowerMaximum = maxFor(range[1], 0.5)!;
  assert.equal(limitDatunLoan(maximum, lowerMaximum, mode), lowerMaximum, "Changing unit or LTV immediately caps an existing loan");
  assert.equal(limitDatunLoan(maximum, null, mode), 0, "Unavailable maximum cannot generate a quote");
  assert.equal(limitDatunLoan(maximum, range[0] - 1, mode), 0, "An unsupported minimum must not exceed the cap");
  assert.equal(limitDatunLoan(Number.NaN, maximum, mode), 0);
  assert.equal(limitDatunLoan(maximum, Number.POSITIVE_INFINITY, mode), 0);
  assert.equal(limitDatunLoan(1, maximum, mode), range[0], "Small inputs snap to the supported minimum");
  for (const requested of [0, 1, range[0], maximum - 1, maximum, maximum + 1, range[1] * 2]) {
    assert.ok(limitDatunLoan(requested, maximum, mode) <= maximum);
  }
}
console.log("Loan limit checks passed for cars and motorcycles");
