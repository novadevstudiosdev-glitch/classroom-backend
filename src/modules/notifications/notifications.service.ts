import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationTargetRole } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
  ) {}

  async getMyNotifications(role: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [items, total] = await this.notificationRepo
      .createQueryBuilder('n')
      .where('n.target_role = :role OR n.target_role = :all', {
        role,
        all: 'all' as NotificationTargetRole,
      })
      .orderBy('n.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }
}
