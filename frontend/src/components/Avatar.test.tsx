import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./Avatar";

describe("Avatar", () => {
  it("renders the initials of a user", () => {
    render(<Avatar kind="user" name="Youness Elfatouaky" />);
    expect(screen.getByText("YE")).toBeInTheDocument();
  });

  it("falls back to two letters for a single-word name", () => {
    render(<Avatar kind="user" name="Youness" />);
    expect(screen.getByText("YO")).toBeInTheDocument();
  });

  it("renders the AI avatar without text", () => {
    const { container } = render(<Avatar kind="ai" />);
    expect(container.querySelector(".avatar-ai")).toBeTruthy();
  });
});
