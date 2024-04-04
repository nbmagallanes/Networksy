const express = require("express");
const { Op } = require("sequelize");
const bcrypt = require("bcryptjs");

const { setTokenCookie, requireAuth } = require("../../utils/auth");
const { Group, GroupImage, Membership, Venue, User } = require("../../db/models");

const { check } = require("express-validator");
const { handleValidationErrors } = require("../../utils/validation");

const router = express.Router();

const validateCreateGroup = [
    check('name')
        .exists({ checkFalsy: true })
        .isLength({ max: 60})
        .withMessage("Name must be 60 characters or less"),
    check('about')
        .exists({ checkFalsy: true })
        .isLength({ min: 50})
        .withMessage("About must be 50 characters or more"),
    check('type')
        .exists({ checkFalsy: true })
        .isIn(["Online", "In person"])
        .withMessage("Type must be 'Online' or 'In person'"),
    check('private')
        .exists({ checkFalsy: true })
        .isBoolean()
        .withMessage("Private must be a boolean"),
    check('city')
        .exists({ checkFalsy: true })
        .withMessage("City is required"),
    check('state')
    .exists({ checkFalsy: true })
    .withMessage("State is required"),
    handleValidationErrors
];

async function memberTotal(groups) {
    if (groups.length > 1) {
        for (let group of groups) {
            const numMembers = await Membership.count({
            where: { groupId: group.id }
            });
            group.dataValues.numMembers = numMembers;
        }   
    } else {
        const numMembers = await Membership.count({
            where: { groupId: groups.id }
        });
        groups.dataValues.numMembers = numMembers;
    }
};

async function imagePreview(groups) {
  for (let group of groups) {
    const image = await GroupImage.findOne({
      where: {
        groupId: group.id,
        preview: true,
      },
    });

    if (image) group.dataValues.previewImage = image.url;
    else group.dataValues.previewImage = null;
  }
};

// Get all groups
router.get("/", async (req, res, next) => {
  const groups = await Group.findAll();

  await memberTotal(groups);
  await imagePreview(groups);

  return res.json({ Groups: groups });
});

// Get groups joined or organized by Current User
router.get("/current", requireAuth, async (req, res, next) => {
  const groups = await Group.findAll({
    include: {
      model: Membership,
      where: {
        userId: req.user.id,
        status: {
            [Op.or]: ["co-host", "member"]
        },
      },
      attributes: [],
    },
  });

  await memberTotal(groups);
  await imagePreview(groups);

  return res.json({ Groups: groups });
});

// Get group info by Id
router.get("/:groupId", async(req, res, next) => {
    const group = await Group.findByPk(req.params.groupId, {
        include: [
            {
                model:  GroupImage,
                attributes: { exclude : ["groupId", "createdAt", "updatedAt"] }
            }, {
                model: User,
                attributes: ["id", "firstName", "lastName"]
            }, {
                model:  Venue,
                attributes: { exclude : ["createdAt", "updatedAt"] }
            }
        ]  
    });

    if (!group) {
        const err = new Error("Group not found");
        err.status = 404;
        err.message = "Group couldn't be found";
        return next(err);
    }

    await memberTotal(group);
    // console.log(group.dataValues.numMembers)

    const { id, organizerId, name, about, type, private, city, state, createdAt, updatedAt, numMembers} = group;

    const payload = {
        id, 
        organizerId, 
        name, 
        about, 
        type, 
        private, 
        city, 
        state, 
        createdAt, 
        updatedAt,
        numMembers: group.dataValues.numMembers,
        GroupImages: group.GroupImages,
        Organizer: group.User,
        Venues: group.Venues
    };
    

    return res.json(payload);
}) ;

// Create group
router.post('/', [requireAuth, validateCreateGroup], async (req, res, next) => {

    const { name, about, type, private, city, state } = req.body;

    const group = await Group.create({ organizerId: req.user.id ,name, about, type, private, city, state });

    if (group) res.status(201);
    return res.json(group);
});

module.exports = router;
