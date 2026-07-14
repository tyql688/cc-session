import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders nothing when closed", () => {
    const { queryByRole } = render(
      <ConfirmDialog
        open={false}
        title="Clear index"
        message="Are you sure?"
        confirmLabel="Continue"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(queryByRole("alertdialog")).toBeNull();
  });

  it("renders title, message and confirm label when open", () => {
    const { getByRole, getByText } = render(
      <ConfirmDialog
        open={true}
        title="Clear index"
        message="Are you sure?"
        confirmLabel="Continue"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const dialog = getByRole("alertdialog");
    expect(dialog).toBeTruthy();
    expect(getByText("Clear index")).toBeTruthy();
    expect(getByText("Are you sure?")).toBeTruthy();
    expect(getByText("Continue")).toBeTruthy();
  });

  it("invokes onConfirm when the confirm button is clicked", () => {
    const onConfirm = vi.fn();
    const { getByText } = render(
      <ConfirmDialog
        open={true}
        title="Clear index"
        message="Are you sure?"
        confirmLabel="Continue"
        onConfirm={onConfirm}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(getByText("Continue"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("applies the danger class to the confirm button when danger is set", () => {
    const { getByText } = render(
      <ConfirmDialog
        open={true}
        title="Clear index"
        message="Are you sure?"
        confirmLabel="Continue"
        danger={true}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    // The destructive variant carries the destructive token classes.
    expect(getByText("Continue").className).toContain("destructive");
  });
});
