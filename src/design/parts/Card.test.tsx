import { beforeEach, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "../../core/tauri";
import { Card } from "./Card";
import { ConnectCard } from "./ConnectCard";

vi.mock("../../core/tauri", () => ({ invoke: vi.fn(async () => null), listen: vi.fn(async () => () => {}) }));

const mockInvoke = vi.mocked(invoke);
const FIELDS = [
  { id: "stripe", label: "Restricted key", placeholder: "rk_live_…", secret: true },
  { id: "name", label: "Account name", placeholder: "", secret: false },
];

beforeEach(() => mockInvoke.mockClear());

describe("Card", () => {
  it("renders header, body, footer note and action", () => {
    const onClick = vi.fn();
    render(
      <Card logo={<i data-testid="logo" />} title="Claude" pill="Max" footer="From the status line." action={{ label: "Refresh", onClick }}>
        body
      </Card>,
    );
    expect(screen.getByTestId("logo")).toBeTruthy();
    expect(screen.getByText("Claude")).toBeTruthy();
    expect(screen.getByText("Max")).toBeTruthy();
    expect(screen.getByText("body")).toBeTruthy();
    expect(screen.getByText("From the status line.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("closes through Rust from its X", () => {
    render(<Card title="x">y</Card>);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mockInvoke).toHaveBeenCalledWith("close_card");
  });

  it("marks a destructive action", () => {
    render(<Card title="x" action={{ label: "Disconnect", onClick: () => {}, danger: true }}>y</Card>);
    expect(screen.getByRole("button", { name: "Disconnect" }).className).toContain("danger");
  });

  it("renders feed text as text, never as HTML", () => {
    const { container } = render(<Card title="<img src=x>">{"<b>hi</b>"}</Card>);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});

describe("ConnectCard", () => {
  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it("stores secrets only through secret_set and passes the rest on", async () => {
    const onConnect = vi.fn(async () => {});
    render(<ConnectCard fields={FIELDS} guide="Needs a key." onConnect={onConnect} />);
    type("Restricted key", "rk_live_abc");
    type("Account name", "acme");
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(onConnect).toHaveBeenCalled());
    expect(mockInvoke).toHaveBeenCalledWith("secret_set", { id: "stripe", value: "rk_live_abc" });
    expect(onConnect).toHaveBeenCalledWith({ name: "acme" });
    expect(JSON.stringify(onConnect.mock.calls)).not.toContain("rk_live_abc");
  });

  it("shows the provider's plain error and forgets the rejected key", async () => {
    const onConnect = vi.fn(async () => {
      throw { kind: "rejected", message: "Stripe didn't accept this key." };
    });
    render(<ConnectCard fields={FIELDS.slice(0, 1)} guide="g" onConnect={onConnect} />);
    type("Restricted key", "rk_bad");
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await screen.findByText("Stripe didn't accept this key.");
    expect(mockInvoke).toHaveBeenCalledWith("secret_delete", { id: "stripe" });
  });

  it("never renders the saved value back", async () => {
    render(<ConnectCard fields={FIELDS.slice(0, 1)} guide="g" onConnect={async () => {}} />);
    const input = screen.getByLabelText("Restricted key") as HTMLInputElement;
    expect(input.type).toBe("password");
    type("Restricted key", "rk_live_abc");
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(input.value).toBe(""));
    expect(document.body.textContent).not.toContain("rk_live_abc");
  });

  it("won't connect with a required field empty", () => {
    render(<ConnectCard fields={FIELDS.slice(0, 1)} guide="g" onConnect={async () => {}} />);
    expect((screen.getByRole("button", { name: "Connect" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the guide", () => {
    render(<ConnectCard fields={[]} guide="Create a key in Stripe." onConnect={async () => {}} />);
    expect(screen.getByText("Create a key in Stripe.")).toBeTruthy();
  });
});
