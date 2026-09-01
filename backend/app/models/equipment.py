import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, Enum as SAEnum, Date, Boolean
from sqlalchemy.orm import relationship
from app.database import Base


class EquipmentStatus(str, enum.Enum):
    active = "active"
    in_calibration = "in_calibration"
    out_of_service = "out_of_service"
    decommissioned = "decommissioned"


class Equipment(Base):
    __tablename__ = "equipment"

    id = Column(Integer, primary_key=True, index=True)
    equipment_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    model = Column(String, nullable=True)
    manufacturer = Column(String, nullable=True)
    serial_number = Column(String, nullable=True)
    status = Column(SAEnum(EquipmentStatus), default=EquipmentStatus.active, nullable=False)
    calibration_due_date = Column(Date, nullable=True)
    last_calibration_date = Column(Date, nullable=True)
    calibration_certificate_ref = Column(String, nullable=True)
    location = Column(String, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    calibration_records = relationship("CalibrationRecord", back_populates="equipment", order_by="CalibrationRecord.calibration_date.desc()")
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
