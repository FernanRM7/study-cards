// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DynamicIsland } from "../dynamic-island";
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("compact quiz countdown", () => {
  it("expires once, has no expandable button, and starts a fresh question at full time", () => {
    const timeout = vi.fn();
    act(() => root.render(<DynamicIsland key="one" seconds={2} active onTimeout={timeout} />));
    expect(host.querySelector('button')).toBeNull();
    expect(host.textContent).toBe('0:02');
    act(() => vi.advanceTimersByTime(4000));
    expect(timeout).toHaveBeenCalledTimes(1); expect(host.textContent).toBe('0:00');
    act(() => root.render(<DynamicIsland key="two" seconds={2} active onTimeout={timeout} />));
    expect(host.textContent).toBe('0:02');
  });
  it("pauses during exit confirmation and resumes the remaining time", () => {
    const timeout = vi.fn();
    const render = (active: boolean) => act(() => root.render(<DynamicIsland seconds={5} active={active} onTimeout={timeout} />));
    render(true); act(() => vi.advanceTimersByTime(2000)); render(false);
    act(() => vi.advanceTimersByTime(10000));
    expect(timeout).not.toHaveBeenCalled(); expect(host.textContent).toBe('0:03');
    render(true); act(() => vi.advanceTimersByTime(3000)); expect(timeout).toHaveBeenCalledTimes(1);
  });
  it("uses elapsed time after a throttled tab and the latest timeout handler", () => {
    const old = vi.fn(), latest = vi.fn();
    act(() => root.render(<DynamicIsland seconds={10} active onTimeout={old} />));
    act(() => root.render(<DynamicIsland seconds={10} active onTimeout={latest} />));
    vi.setSystemTime(Date.now() + 20000);
    act(() => vi.advanceTimersByTime(100));
    expect(old).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledTimes(1);
  });
});
