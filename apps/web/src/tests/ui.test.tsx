import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader } from "../components/ui/Card";
import { Input } from "../components/ui/Input";

describe("Shared UI primitives", () => {
  it("gives Button a default button type, handles clicks, and respects disabled state", () => {
    const onClick = vi.fn();
    render(
      <div>
        <Button onClick={onClick} className="custom-action">
          Save draft
        </Button>
        <Button disabled onClick={onClick}>
          Disabled action
        </Button>
      </div>,
    );

    const activeButton = screen.getByRole("button", { name: "Save draft" });
    expect(activeButton).toHaveAttribute("type", "button");
    expect(activeButton).toHaveClass("custom-action");
    fireEvent.click(activeButton);
    expect(onClick).toHaveBeenCalledTimes(1);

    const disabledButton = screen.getByRole("button", { name: "Disabled action" });
    expect(disabledButton).toBeDisabled();
    fireEvent.click(disabledButton);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("preserves native Input semantics, error state, and disabled behavior", () => {
    render(
      <div>
        <label htmlFor="course-code">Course code</label>
        <Input id="course-code" placeholder="CAT304" hasError />
        <label htmlFor="locked-field">Locked field</label>
        <Input id="locked-field" disabled value="Read only" readOnly />
      </div>,
    );

    const courseInput = screen.getByLabelText("Course code");
    expect(courseInput).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(courseInput, { target: { value: "CAT304" } });
    expect(courseInput).toHaveValue("CAT304");

    const lockedInput = screen.getByLabelText("Locked field");
    expect(lockedInput).toBeDisabled();
  });

  it("renders Badge and Card containers with custom classes", () => {
    render(
      <Card className="custom-card" data-testid="card">
        <CardHeader>
          <Badge variant="primary" className="custom-badge">
            Module 1
          </Badge>
        </CardHeader>
        <CardContent>Container body</CardContent>
      </Card>,
    );

    expect(screen.getByTestId("card")).toHaveClass("custom-card");
    expect(screen.getByText("Module 1")).toHaveClass("custom-badge");
    expect(screen.getByText("Container body")).toBeInTheDocument();
  });
});
