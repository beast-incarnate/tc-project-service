
import validate from 'express-validation';
import _ from 'lodash';
import Joi from 'joi';
import {
  middleware as tcMiddleware,
} from 'tc-core-library-js';
import models from '../../models';
import util from '../../util';
import { EVENT, RESOURCES } from '../../constants';

/**
 * API to update a project member.
 */
const permissions = tcMiddleware.permissions;

const updateProjectAttachmentValidation = {
  body: Joi.object().keys({
    title: Joi.string().required(),
    description: Joi.string().optional().allow(null).allow(''),
    allowedUsers: Joi.array().items(Joi.number().integer().positive()).allow(null).default(null),
    tags: Joi.array().items(Joi.string().min(1)).optional(),
    path: Joi.string(),
  }),
};

module.exports = [
  // handles request validations
  validate(updateProjectAttachmentValidation),
  permissions('project.updateAttachment'),
  /**
   * Update a attachment if the user has access
   */
  (req, res, next) => {
    const updatedProps = req.body;
    const projectId = _.parseInt(req.params.projectId);
    const attachmentId = _.parseInt(req.params.id);
    let previousValue;
    updatedProps.updatedBy = req.authUser.userId;
    models.sequelize.transaction(() => models.ProjectAttachment.findOne({
      where: {
        id: attachmentId,
        projectId,
      },
    }).then(existing => new Promise((accept, reject) => {
      if (!existing) {
          // handle 404
        const err = new Error('project attachment not found for project id ' +
              `${projectId} and member id ${attachmentId}`);
        err.status = 404;
        reject(err);
      } else {
        previousValue = _.cloneDeep(existing.get({ plain: true }));
        _.extend(existing, updatedProps);
        existing.save().then(accept).catch(reject);
      }
    })).then((updated) => {
      req.log.debug('updated project attachment', JSON.stringify(updated, null, 2));
      res.json(updated);
      // emit original and updated project information
      req.app.services.pubsub.publish(
        EVENT.ROUTING_KEY.PROJECT_ATTACHMENT_UPDATED,
        { original: previousValue, updated: updated.get({ plain: true }) },
        { correlationId: req.id },
      );

      // emit the event
      util.sendResourceToKafkaBus(
        req,
        EVENT.ROUTING_KEY.PROJECT_ATTACHMENT_UPDATED,
        RESOURCES.ATTACHMENT,
        updated.toJSON());
    }).catch(err => next(err)));
  },
];
