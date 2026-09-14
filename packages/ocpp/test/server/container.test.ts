// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { buildContainer, type Prebuilt } from '@/server/container.js';
import type { RabbitMQConnectionManager } from '@/transport/queue/rabbit-mq/connection-manager.js';
import type { SystemConfig } from '@citrineos/types';
import amqp from 'amqplib';
import { type ILogObj, Logger } from 'tslog';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('amqplib', () => ({ default: { connect: vi.fn() } }));
vi.mock('@citrineos/dal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@citrineos/dal')>()),
  DefaultSequelizeInstance: { getInstance: vi.fn() },
}));

describe('buildContainer', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('caps the RabbitMQ reconnect backoff at maxReconnectDelaySeconds', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    vi.mocked(amqp.connect).mockRejectedValue(new Error('connect ECONNREFUSED'));
    const config = {
      messageBroker: {
        amqp: { url: 'amqp://localhost', exchange: 'citrineos', maxReconnectDelaySeconds: 30 },
      },
      timeouts: { maxCallLengthSeconds: 30 },
    } as unknown as SystemConfig;
    const prebuilt = { logger: new Logger<ILogObj>({ type: 'hidden' }) } as unknown as Prebuilt;
    const manager = buildContainer(config, prebuilt).resolve<RabbitMQConnectionManager>(
      'connectionManager',
    );

    await expect(manager.connect()).rejects.toThrow('connect ECONNREFUSED');
    for (let attempt = 2; attempt <= 6; attempt++) {
      await vi.advanceTimersToNextTimerAsync();
    }

    expect(amqp.connect).toHaveBeenCalledTimes(6);
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 31_000);
    await manager.close();
  });
});
